import "server-only";
import type { TermCode } from "@/lib/term";
import { ReqCodeSchema, type CatalogFilters, type ResolvedTerms } from "@/lib/types/catalog";
import CatalogMeta from "@/models/CatalogMeta";
import { runInBackground } from "@/server/catalog/background";
import { FILTERS_TTL_MS, RETRY_AFTER_MS, UPSTREAM_TIMEOUT_MS } from "@/server/catalog/config";
import { cleanText } from "@/server/catalog/html";
import type { TermMeta } from "@/server/catalog/meta";
import { isHotTerm } from "@/server/catalog/terms";
import { fetchFilters, type UpstreamFilters } from "@/server/catalog/upstream";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { MissingFixtureError } from "@/server/http/fixtures";

/**
 * Canonical departments and requirements of a term (PLAN §5: `/micro/public/v2/course-schedule/filters/{term}`).
 * The current and registration terms use the upstream lists, cached in CatalogMeta `filters:<code>` for a day
 * (refreshed in the background, last good copy on failure). Other terms, and any term whose upstream list is
 * unavailable, use the names recorded while ingesting its sections, so a past term never calls upstream.
 */

export const filtersKey = (term: TermCode) => `filters:${term}`;

/** Upstream lists → CatalogFilters (unknown requirement codes dropped, duplicates removed). */
export function toCatalogFilters(term: TermCode, upstream: UpstreamFilters): CatalogFilters {
  const departments = new Map<string, string>();
  for (const dept of upstream.departments) {
    const code = cleanText(dept.code).toUpperCase();
    if (code && !departments.has(code)) departments.set(code, cleanText(dept.description) || code);
  }
  const requirements = new Map<string, string>();
  for (const req of upstream.grad_requirements) {
    const code = ReqCodeSchema.safeParse(cleanText(req.code).toUpperCase());
    if (code.success && !requirements.has(code.data)) {
      requirements.set(code.data, cleanText(req.description) || code.data);
    }
  }
  return {
    term,
    departments: [...departments].map(([code, name]) => ({ code, name })),
    requirements: [...requirements].map(([code, name]) => ({
      code: ReqCodeSchema.parse(code),
      name,
    })),
  };
}

/** Filters from what the ingest saw in the term's sections. */
export function derivedFilters(term: TermCode, meta: TermMeta | null): CatalogFilters {
  return {
    term,
    departments: meta?.data?.departments ?? [],
    requirements: (meta?.data?.requirements ?? []).flatMap((req) => {
      const code = ReqCodeSchema.safeParse(req.code);
      return code.success ? [{ code: code.data, name: req.name }] : [];
    }),
  };
}

async function refreshFilters(term: TermCode): Promise<CatalogFilters | null> {
  await getDb();
  const at = now();
  try {
    const filters = toCatalogFilters(
      term,
      await fetchFilters(term, { timeoutMs: UPSTREAM_TIMEOUT_MS }),
    );
    if (filters.departments.length === 0) throw new Error("The filters list has no departments");
    await CatalogMeta.updateOne(
      { key: filtersKey(term) },
      {
        $set: {
          kind: "filters",
          termCode: term,
          data: filters,
          lastSuccessAt: at,
          lastAttemptAt: at,
          lastError: null,
        },
      },
      { upsert: true },
    );
    return filters;
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    console.error(`[catalog] filters ${term} refresh failed:`, error);
    await CatalogMeta.updateOne(
      { key: filtersKey(term) },
      {
        $set: {
          kind: "filters",
          termCode: term,
          lastAttemptAt: at,
          lastErrorAt: at,
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        },
      },
      { upsert: true },
    );
    return null;
  }
}

function storedFilters(term: TermCode, data: unknown): CatalogFilters | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Partial<CatalogFilters>;
  if (!Array.isArray(value.departments) || !Array.isArray(value.requirements)) return null;
  return { term, departments: value.departments, requirements: value.requirements };
}

export async function getCatalogFiltersImpl(
  term: TermCode,
  resolved: ResolvedTerms,
  meta: TermMeta | null,
): Promise<CatalogFilters> {
  if (!isHotTerm(term, resolved)) return derivedFilters(term, meta);
  await getDb();
  const doc = await CatalogMeta.findOne({ key: filtersKey(term) }).lean();
  const cached = storedFilters(term, doc?.data);
  const at = now();
  const since = (value: Date | null | undefined) =>
    value ? at.getTime() - value.getTime() : Number.POSITIVE_INFINITY;
  const canRetry = since(doc?.lastAttemptAt) >= RETRY_AFTER_MS;
  if (cached) {
    if (since(doc?.lastSuccessAt) > FILTERS_TTL_MS && canRetry) {
      runInBackground(`filters ${term}`, () => refreshFilters(term));
    }
    return cached;
  }
  const fresh = canRetry ? await refreshFilters(term) : null;
  return fresh ?? derivedFilters(term, meta);
}
