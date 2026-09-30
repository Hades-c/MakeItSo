import "server-only";
import type { TermCode } from "@/lib/term";
import { ReqCodeSchema, type CatalogFilters, type ResolvedTerms } from "@/lib/types/catalog";
import CatalogMeta from "@/models/CatalogMeta";
import { runInBackground } from "@/server/catalog/background";
import { FILTERS_TTL_MS, RETRY_AFTER_MS, UPSTREAM_TIMEOUT_MS } from "@/server/catalog/config";
import { cleanText } from "@/server/catalog/html";
import type { TermMeta } from "@/server/catalog/meta";
import { isHotTerm } from "@/server/catalog/terms";
import { onCatalogReset } from "@/server/catalog/state";
import { fetchFilters, type UpstreamFilters } from "@/server/catalog/upstream";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";

/**
 * Canonical departments and requirements of a term (PLAN §5: `/micro/public/v2/course-schedule/filters/{term}`).
 * The current and registration terms use the upstream lists, cached in CatalogMeta `filters:<code>` for a day
 * (refreshed in the background, last good copy on failure). Other terms, and any term whose upstream list is
 * not cached yet or unavailable, use the names recorded while ingesting its sections, so a past term never calls
 * upstream and no read ever waits on the filters endpoint.
 *
 * Refreshes are single flight: one in-process promise per term, and an atomic claim on the doc's lastAttemptAt
 * (at most one attempt per term every 5 minutes across instances), taken before the request goes out.
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

const inflight = new Map<TermCode, Promise<CatalogFilters | null>>();
let fetchFiltersFn: typeof fetchFilters = fetchFilters;

onCatalogReset(() => {
  inflight.clear();
  fetchFiltersFn = fetchFilters;
});

/** Tests: replace the upstream filters request (latency, failures, call counts). Reset by resetCatalogState(). */
export function setFiltersFetchForTests(fetcher: typeof fetchFilters): void {
  fetchFiltersFn = fetcher;
}

/**
 * Claim this attempt: set lastAttemptAt only when no attempt was made in the last RETRY_AFTER_MS (server clock).
 * False when another request or instance attempted it recently (its fetch may still be running).
 */
async function claimAttempt(term: TermCode, at: Date): Promise<boolean> {
  const retryBefore = new Date(at.getTime() - RETRY_AFTER_MS);
  try {
    const doc = await CatalogMeta.findOneAndUpdate(
      {
        key: filtersKey(term),
        $or: [{ lastAttemptAt: null }, { lastAttemptAt: trusted({ $lte: retryBefore }) }],
      },
      {
        $set: { lastAttemptAt: at },
        $setOnInsert: { kind: "filters", termCode: term },
      },
      { upsert: true, returnDocument: "after" },
    ).lean();
    return doc?.lastAttemptAt?.getTime() === at.getTime();
  } catch (error) {
    // The filter missed an existing (recently attempted) doc, so the upsert collided with it.
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

async function fetchAndStore(term: TermCode): Promise<CatalogFilters | null> {
  await getDb();
  const at = now();
  if (!(await claimAttempt(term, at))) return null;
  try {
    const filters = toCatalogFilters(
      term,
      await fetchFiltersFn(term, { timeoutMs: UPSTREAM_TIMEOUT_MS }),
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
          lastError: null,
          lastErrorAt: null,
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
          lastErrorAt: at,
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        },
      },
      { upsert: true },
    );
    return null;
  }
}

/** Fetch a term's upstream lists now (single flight; null when upstream failed or an attempt is recent). */
export function refreshFilters(term: TermCode): Promise<CatalogFilters | null> {
  let pending = inflight.get(term);
  if (!pending) {
    const started = fetchAndStore(term);
    pending = started;
    inflight.set(term, started);
    const settle = () => {
      if (inflight.get(term) === started) inflight.delete(term);
    };
    started.then(settle, settle);
  }
  return pending;
}

function storedFilters(term: TermCode, data: unknown): CatalogFilters | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Partial<CatalogFilters>;
  if (!Array.isArray(value.departments) || !Array.isArray(value.requirements)) return null;
  return { term, departments: value.departments, requirements: value.requirements };
}

interface FiltersState {
  cached: CatalogFilters | null;
  /** The cached copy is older than a day (or missing), and no attempt was made in the last 5 minutes. */
  due: boolean;
}

async function filtersState(term: TermCode): Promise<FiltersState> {
  await getDb();
  const doc = await CatalogMeta.findOne({ key: filtersKey(term) }).lean();
  const cached = storedFilters(term, doc?.data);
  const at = now();
  const since = (value: Date | null | undefined) =>
    value ? at.getTime() - value.getTime() : Number.POSITIVE_INFINITY;
  const canRetry = since(doc?.lastAttemptAt) >= RETRY_AFTER_MS;
  const stale = !cached || since(doc?.lastSuccessAt) > FILTERS_TTL_MS;
  return { cached, due: stale && canRetry };
}

export async function getCatalogFiltersImpl(
  term: TermCode,
  resolved: ResolvedTerms,
  meta: TermMeta | null,
): Promise<CatalogFilters> {
  if (!isHotTerm(term, resolved)) return derivedFilters(term, meta);
  const { cached, due } = await filtersState(term);
  if (due && !inflight.has(term)) {
    runInBackground(`filters ${term}`, () => refreshFilters(term));
  }
  return cached ?? derivedFilters(term, meta);
}

/** The cron: fetch a hot term's upstream lists when they are missing or older than a day (awaited). */
export async function warmFilters(term: TermCode, resolved: ResolvedTerms): Promise<void> {
  if (!isHotTerm(term, resolved)) return;
  const { due } = await filtersState(term);
  if (due) await refreshFilters(term);
}
