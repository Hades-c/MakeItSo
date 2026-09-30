import "server-only";
import type { TermCode } from "@/lib/term";
import type { ResolvedTerms } from "@/lib/types/catalog";
import { runInBackground } from "@/server/catalog/background";
import {
  COLD_FAILURE_TTL_MS,
  COLD_POLL_MS,
  COLD_WAIT_MS,
  HOT_TERM_TTL_MS,
  PAST_TERM_TTL_MS,
  RETRY_AFTER_MS,
  scheduleUnavailable,
} from "@/server/catalog/config";
import {
  defaultIngestDeps,
  ingestTerm,
  type IngestDeps,
  type IngestOutcome,
} from "@/server/catalog/ingest";
import {
  acquireTermLease,
  getTermMeta,
  invalidateTermMetas,
  readTermMeta,
  releaseTermLease,
  type TermMeta,
} from "@/server/catalog/meta";
import { onCatalogReset } from "@/server/catalog/state";
import { ingestWindow, inIngestWindow, isHotTerm } from "@/server/catalog/terms";
import { now } from "@/server/clock";

/**
 * When a term is (re)fetched (PLAN §5 "Refresh"):
 * - cold: a term in the ingest window with no successful ingest yet is fetched synchronously once (8 s upstream
 *   timeout); if that fails the read answers 503 "Schedule data is temporarily unavailable" (and fails fast for
 *   30 s) instead of hanging;
 * - hot (current + registration terms) older than 15 min: served stale, refreshed in the background (after());
 * - past terms: refreshed by the nightly cron (server/catalog/cron.ts), never on a read.
 * Refreshes are single flight: one in-process promise per term, plus a CatalogMeta lease so concurrent instances
 * don't stampede upstream.
 */

export type RefreshStatus = IngestOutcome["status"] | "locked";

export interface RefreshOutcome extends Omit<IngestOutcome, "status"> {
  status: RefreshStatus;
}

const inflight = new Map<TermCode, Promise<RefreshOutcome>>();
const coldFailures = new Map<TermCode, number>();
let ingestDeps: IngestDeps = defaultIngestDeps;

onCatalogReset(() => {
  inflight.clear();
  coldFailures.clear();
  ingestDeps = defaultIngestDeps;
});

/** Tests: replace how pages are fetched (pagination, guard and timeout tests). Reset by resetCatalogState(). */
export function setIngestDepsForTests(deps: Partial<IngestDeps>): void {
  ingestDeps = { ...defaultIngestDeps, ...deps };
}

/** Refresh one term now: single flight in this process, and only while holding the term's lease. */
export function refreshTerm(term: TermCode): Promise<RefreshOutcome> {
  const running = inflight.get(term);
  if (running) return running;
  const promise = (async (): Promise<RefreshOutcome> => {
    const owner = await acquireTermLease(term);
    if (!owner) {
      return {
        term,
        status: "locked",
        sectionCount: (await readTermMeta(term))?.sectionCount ?? 0,
      };
    }
    try {
      return await ingestTerm(term, ingestDeps);
    } finally {
      await releaseTermLease(term, owner).catch((error: unknown) => {
        console.error(`[catalog] could not release the ${term} lease:`, error);
      });
      invalidateTermMetas();
    }
  })();
  inflight.set(term, promise);
  const settle = () => {
    if (inflight.get(term) === promise) inflight.delete(term);
  };
  promise.then(settle, settle);
  return promise;
}

function age(since: Date | null, at: Date): number {
  return since ? at.getTime() - since.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * A term's data is due for a refresh (never ingested; hot: older than 15 min; past: older than 20 h), and the
 * last attempt is not too recent (a failing upstream is retried every 5 minutes at most, not on every read).
 */
export function isRefreshDue(meta: TermMeta | null, hot: boolean, at: Date = now()): boolean {
  if (!meta?.lastSuccessAt) return age(meta?.lastAttemptAt ?? null, at) >= RETRY_AFTER_MS;
  const ttl = hot ? HOT_TERM_TTL_MS : PAST_TERM_TTL_MS;
  if (age(meta.lastSuccessAt, at) <= ttl) return false;
  // After a failure, wait before trying again (the last attempt is newer than the last success).
  return age(meta.lastAttemptAt, at) >= Math.min(ttl, RETRY_AFTER_MS);
}

/** Data younger than its refresh interval (hot: 15 min, past: 20 h). */
export function isFresh(meta: TermMeta | null, hot: boolean, at: Date = now()): boolean {
  return (
    !!meta?.lastSuccessAt &&
    age(meta.lastSuccessAt, at) <= (hot ? HOT_TERM_TTL_MS : PAST_TERM_TTL_MS)
  );
}

/** Another instance holds the lease: wait (bounded) for its result instead of fetching a second time. */
async function waitForOtherInstance(term: TermCode): Promise<TermMeta | null> {
  const deadline = Date.now() + COLD_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, COLD_POLL_MS));
    const meta = await readTermMeta(term);
    if (meta?.lastSuccessAt) return meta;
    // Lease released (or expired) without a success: that refresh failed.
    if (!meta?.lockUntil || meta.lockUntil.getTime() <= Date.now()) return null;
  }
  return null;
}

async function coldLoad(term: TermCode): Promise<TermMeta> {
  const failedUntil = coldFailures.get(term) ?? 0;
  if (Date.now() < failedUntil) throw scheduleUnavailable();
  const outcome = await refreshTerm(term);
  const meta =
    outcome.status === "locked" ? await waitForOtherInstance(term) : await readTermMeta(term);
  if (meta?.lastSuccessAt) {
    invalidateTermMetas();
    return meta;
  }
  coldFailures.set(term, Date.now() + COLD_FAILURE_TTL_MS);
  throw scheduleUnavailable();
}

/**
 * Make sure a term's data can be read, following the rules above. Returns the term's meta, or null for a term
 * outside the ingest window that was never ingested (callers answer "no data" for it). Throws ApiError 503 when a
 * cold load fails.
 */
export async function ensureTermData(
  term: TermCode,
  resolved: ResolvedTerms,
): Promise<TermMeta | null> {
  const meta = await getTermMeta(term);
  if (!inIngestWindow(term, resolved)) return meta?.lastSuccessAt ? meta : null;
  if (!meta?.lastSuccessAt) return coldLoad(term);
  const hot = isHotTerm(term, resolved);
  if (hot && isRefreshDue(meta, true)) {
    runInBackground(`refresh ${term}`, () => refreshTerm(term));
  }
  return meta;
}

let backfilling: Promise<void> | null = null;

onCatalogReset(() => {
  backfilling = null;
});

/**
 * Ingest every window term that has never been ingested, oldest first, in the background (course history asks
 * for terms the cron has not reached yet). Single flight.
 */
export function scheduleBackfill(resolved: ResolvedTerms, missing: readonly TermCode[]): void {
  if (backfilling || missing.length === 0) return;
  const window = new Set(ingestWindow(resolved));
  const terms = missing.filter((term) => window.has(term));
  if (terms.length === 0) return;
  runInBackground("history backfill", async () => {
    backfilling ??= (async () => {
      for (const term of terms) await refreshTerm(term);
    })().finally(() => {
      backfilling = null;
    });
    await backfilling;
  });
}
