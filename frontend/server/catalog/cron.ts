import "server-only";
import { z } from "zod";
import { TermCodeSchema } from "@/lib/types/common";
import type { TermCode } from "@/lib/term";
import { warmFilters } from "@/server/catalog/filters";
import { listTermMetas } from "@/server/catalog/meta";
import { isFresh, isRefreshDue, refreshTerm } from "@/server/catalog/refresh";
import {
  ingestWindow,
  isHotTerm,
  refreshTermsList,
  resolveTermsImpl,
} from "@/server/catalog/terms";
import { now } from "@/server/clock";
import { MissingFixtureError } from "@/server/http/fixtures";

/**
 * The catalog's scheduled job (GET /api/cron/catalog, nightly): refresh the terms list, then every term of the
 * ingest window that is due — never ingested (the first run backfills 202201 → registration), a past term older
 * than 20 h, or a hot term older than 15 min (a term whose last attempt failed under 5 minutes ago is "waiting").
 * Oldest first, the registration term last. Stops starting new terms after `budgetMs` (the rest report "skipped"
 * and go first next time, being older).
 */

export const CATALOG_CRON_STATUSES = [
  "updated",
  "unchanged",
  "rejected",
  "failed",
  "locked",
  "fresh",
  "waiting",
  "skipped",
] as const;

export const CatalogCronResultSchema = z.object({
  ok: z.boolean(),
  current: TermCodeSchema,
  registration: TermCodeSchema,
  terms: z.array(
    z.object({
      term: TermCodeSchema,
      status: z.enum(CATALOG_CRON_STATUSES),
      sectionCount: z.number().int().min(0).optional(),
      error: z.string().optional(),
    }),
  ),
});
export type CatalogCronResult = z.infer<typeof CatalogCronResultSchema>;

export interface CatalogCronOptions {
  /** Stop starting new terms after this long (real clock). Default 240 s (the route allows 300 s). */
  budgetMs?: number;
}

export async function runCatalogCron({
  budgetMs = 240_000,
}: CatalogCronOptions = {}): Promise<CatalogCronResult> {
  const started = Date.now();
  await refreshTermsList();
  const resolved = await resolveTermsImpl();
  const hot = new Set<TermCode>([resolved.current, resolved.registration]);
  const order = [
    ...ingestWindow(resolved).filter((term) => !hot.has(term)),
    ...[resolved.current, resolved.registration].filter((term, i, all) => all.indexOf(term) === i),
  ];
  const metas = await listTermMetas();
  const at = now();
  const terms: CatalogCronResult["terms"] = [];
  for (const term of order) {
    const meta = metas.get(term) ?? null;
    const hotTerm = isHotTerm(term, resolved);
    if (!isRefreshDue(meta, hotTerm, at)) {
      // "waiting": due, but the last attempt failed less than 5 minutes ago.
      const status = isFresh(meta, hotTerm, at) ? "fresh" : "waiting";
      terms.push({ term, status, sectionCount: meta?.sectionCount ?? 0 });
      continue;
    }
    if (Date.now() - started > budgetMs) {
      terms.push({ term, status: "skipped" });
      continue;
    }
    const outcome = await refreshTerm(term, {
      hot: hotTerm,
      due: (latest) => isRefreshDue(latest, hotTerm),
    });
    terms.push({
      term,
      status: outcome.status,
      sectionCount: outcome.sectionCount,
      ...(outcome.error ? { error: outcome.error } : {}),
    });
  }
  // Warm the canonical filter lists of the hot terms (best effort; reads fall back on their own).
  for (const term of hot) {
    try {
      await warmFilters(term, resolved);
    } catch (error) {
      if (error instanceof MissingFixtureError) throw error;
      console.error(`[catalog] cron: filters ${term} failed:`, error);
    }
  }
  return {
    ok: terms.every((row) => row.status !== "failed" && row.status !== "rejected"),
    current: resolved.current,
    registration: resolved.registration,
    terms,
  };
}
