import "server-only";
import {
  compareTerms,
  currentTermFrom,
  isSummer,
  isTermCode,
  nextRegularTerm,
  registrationTermFrom,
  termLabel,
  termsBetween,
  type TermCode,
  type TermScheduleEntry,
} from "@/lib/term";
import type { ResolvedTerms, TermInfo } from "@/lib/types/catalog";
import CatalogMeta from "@/models/CatalogMeta";
import { runInBackground } from "@/server/catalog/background";
import {
  HISTORY_START,
  RETRY_AFTER_MS,
  TERMS_MEMO_MS,
  TERMS_TTL_MS,
  UPSTREAM_TIMEOUT_MS,
} from "@/server/catalog/config";
import { listTermMetas } from "@/server/catalog/meta";
import { onCatalogReset } from "@/server/catalog/state";
import { fetchTermsList, UpstreamTermSchema } from "@/server/catalog/upstream";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { MissingFixtureError } from "@/server/http/fixtures";

/**
 * Terms (PLAN §5 "Terms"). The upstream list (`/api/public/v2/terms?limit=500`) is cached in CatalogMeta `terms`
 * and refreshed in the background when older than 6 h; when upstream fails the last good list keeps serving, and
 * when no list was ever fetched the date rules take over (lib/term.ts termFromDateET). Current and registration
 * terms always come from the lib/term.ts resolvers (registration = the first regular term after current, NOT the
 * upstream is_next flag, which points at the summer during spring).
 */

export const TERMS_KEY = "terms";

export interface TermEntry {
  code: TermCode;
  isSummer: boolean;
  /** Upstream flags, kept as hints only. */
  isActive: boolean;
  isNext: boolean;
  startDate: string | null;
  endDate: string | null;
}

interface TermsList {
  entries: TermEntry[];
  asOf: Date | null;
}

let memo: (TermsList & { checkedAt: number }) | null = null;
let refreshing: Promise<TermEntry[] | null> | null = null;
let fetchTerms: typeof fetchTermsList = fetchTermsList;

onCatalogReset(() => {
  memo = null;
  refreshing = null;
  fetchTerms = fetchTermsList;
});

/** Tests: replace the upstream terms request (failures, call counts). Reset by resetCatalogState(). */
export function setTermsFetchForTests(fetcher: typeof fetchTermsList): void {
  fetchTerms = fetcher;
}

/** Upstream date (UTC-midnight epoch ms or ISO string) → "YYYY-MM-DD" (UTC calendar date); null if unusable. */
export function toDayKey(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const key = value.slice(0, 10);
    return Number.isNaN(Date.parse(`${key}T00:00:00Z`)) ? null : key;
  }
  const date = new Date(typeof value === "string" ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Raw upstream terms → semester-era entries (pseudo-terms and trimester codes dropped), ascending. */
export function normaliseTermEntries(items: readonly unknown[]): TermEntry[] {
  const byCode = new Map<TermCode, TermEntry>();
  for (const item of items) {
    const parsed = UpstreamTermSchema.safeParse(item);
    if (!parsed.success) continue;
    const code = parsed.data.term_code.trim();
    if (!isTermCode(code) || byCode.has(code)) continue;
    byCode.set(code, {
      code,
      isSummer: isSummer(code),
      isActive: parsed.data.is_active === true,
      isNext: parsed.data.is_next === true,
      startDate: toDayKey(parsed.data.start_date),
      endDate: toDayKey(parsed.data.end_date),
    });
  }
  return [...byCode.values()].sort((a, b) => compareTerms(a.code, b.code));
}

function storedEntries(data: unknown): TermEntry[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (entry): entry is TermEntry =>
      typeof entry === "object" && entry !== null && isTermCode((entry as TermEntry).code),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fetch and store the upstream terms list now (single flight). Null when upstream failed. */
export function refreshTermsList(): Promise<TermEntry[] | null> {
  refreshing ??= (async () => {
    await getDb();
    const at = now();
    try {
      const entries = normaliseTermEntries(await fetchTerms({ timeoutMs: UPSTREAM_TIMEOUT_MS }));
      if (!entries.some((entry) => !entry.isSummer)) {
        throw new Error("The terms list has no Fall or Spring terms");
      }
      await CatalogMeta.updateOne(
        { key: TERMS_KEY },
        {
          $set: {
            kind: "terms",
            data: entries,
            lastSuccessAt: at,
            lastAttemptAt: at,
            fetchedAt: at,
            lastError: null,
            lastErrorAt: null,
          },
        },
        { upsert: true },
      );
      memo = null;
      return entries;
    } catch (error) {
      if (error instanceof MissingFixtureError) throw error;
      console.error("[catalog] terms list refresh failed:", error);
      await CatalogMeta.updateOne(
        { key: TERMS_KEY },
        {
          $set: {
            kind: "terms",
            lastAttemptAt: at,
            lastErrorAt: at,
            lastError: errorMessage(error).slice(0, 500),
          },
        },
        { upsert: true },
      );
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function elapsed(since: Date | null | undefined, at: Date): number {
  return since ? at.getTime() - since.getTime() : Number.POSITIVE_INFINITY;
}

/** The cached terms list (memoised), refreshing it as needed; null when none is available at all. */
async function loadTermsList(): Promise<TermsList | null> {
  if (memo && Date.now() - memo.checkedAt < TERMS_MEMO_MS) {
    return memo.entries.length > 0 ? memo : null;
  }
  await getDb();
  const doc = await CatalogMeta.findOne({ key: TERMS_KEY }).lean();
  const entries = storedEntries(doc?.data);
  const at = now();
  const canRetry = elapsed(doc?.lastAttemptAt, at) >= RETRY_AFTER_MS;
  if (entries.length > 0) {
    if (elapsed(doc?.lastSuccessAt, at) > TERMS_TTL_MS && canRetry) {
      runInBackground("terms refresh", refreshTermsList);
    }
    memo = { entries, asOf: doc?.lastSuccessAt ?? null, checkedAt: Date.now() };
    return memo;
  }
  if (canRetry) {
    const fresh = await refreshTermsList();
    if (fresh) {
      const stored = await CatalogMeta.findOne({ key: TERMS_KEY }).lean();
      memo = { entries: fresh, asOf: stored?.lastSuccessAt ?? at, checkedAt: Date.now() };
      return memo;
    }
  }
  memo = { entries: [], asOf: null, checkedAt: Date.now() };
  return null;
}

export interface ResolveTermsOptions {
  now?: Date;
}

/** Every known term with current and registration resolved; never throws for an upstream outage. */
export async function resolveTermsImpl(options: ResolveTermsOptions = {}): Promise<ResolvedTerms> {
  const at = options.now ?? now();
  const list = await loadTermsList();
  const entries = list?.entries ?? [];
  const schedule: TermScheduleEntry[] = entries.map((entry) => ({
    code: entry.code,
    isSummer: entry.isSummer,
    isActive: entry.isActive,
    startDate: entry.startDate,
    endDate: entry.endDate,
  }));
  const current = currentTermFrom(schedule, { now: at });
  const registration = registrationTermFrom(schedule, { now: at });
  const metas = await listTermMetas();

  const byCode = new Map(entries.map((entry) => [entry.code, entry]));
  const codes = new Set<TermCode>([
    ...entries.map((entry) => entry.code).filter((code) => compareTerms(code, HISTORY_START) >= 0),
    ...termsBetween(HISTORY_START, nextRegularTerm(registration), { includeSummer: true }),
    ...[...metas.values()].filter((meta) => meta.sectionCount > 0).map((meta) => meta.term),
  ]);
  const terms: TermInfo[] = [...codes]
    .filter(isTermCode)
    .sort(compareTerms)
    .map((code) => {
      const entry = byCode.get(code);
      return {
        code,
        label: termLabel(code),
        isActive: code === current,
        isRegistration: code === registration,
        isSummer: isSummer(code),
        published: (metas.get(code)?.sectionCount ?? 0) > 0,
        ...(entry?.startDate ? { startDate: entry.startDate } : {}),
        ...(entry?.endDate ? { endDate: entry.endDate } : {}),
      };
    });
  return { terms, current, registration, asOf: list?.asOf?.toISOString() ?? null };
}

/** Terms W1 ingests: 202201 through the registration term, summers included (PLAN §5). */
export function ingestWindow(resolved: Pick<ResolvedTerms, "registration">): TermCode[] {
  return termsBetween(HISTORY_START, resolved.registration, { includeSummer: true });
}

export function inIngestWindow(term: TermCode, resolved: Pick<ResolvedTerms, "registration">) {
  return (
    isTermCode(term) &&
    compareTerms(term, HISTORY_START) >= 0 &&
    compareTerms(term, resolved.registration) <= 0
  );
}

/** Current and registration terms refresh every 15 minutes; the rest nightly. */
export function isHotTerm(
  term: TermCode,
  resolved: Pick<ResolvedTerms, "current" | "registration">,
): boolean {
  return term === resolved.current || term === resolved.registration;
}
