import "server-only";
import type { TermCode } from "@/lib/term";
import type { ResolvedTerms } from "@/lib/types/catalog";
import { runInBackground } from "@/server/catalog/background";
import {
  COLD_DEADLINE_MS,
  COLD_FAILURE_TTL_MS,
  COLD_POLL_MS,
  HOT_TERM_TTL_MS,
  LOCK_MEMO_MS,
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
 *   timeout) within one deadline (COLD_DEADLINE_MS, also bounding the wait for another instance's load); past
 *   the deadline or on failure the read answers 503 "Schedule data is temporarily unavailable" instead of hanging
 *   (a failure then fails fast for 30 s; a load still running finishes in the background);
 * - hot (current + registration terms) older than 15 min: served stale, refreshed in the background (after());
 * - past terms: refreshed by the nightly cron (server/catalog/cron.ts), never on a read.
 * Refreshes are single flight: one in-process promise per term, plus a CatalogMeta lease so concurrent instances
 * don't stampede upstream. Whoever takes the lease re-reads the term's meta first and skips the fetch when another
 * instance refreshed it meanwhile; a lease found held elsewhere is remembered (until it expires, at most 15 s), so
 * reads don't retry it on every request, and cold readers share one wait per term.
 */

export type RefreshStatus = IngestOutcome["status"] | "locked" | "fresh" | "waiting";

export interface RefreshOutcome extends Omit<IngestOutcome, "status"> {
  status: RefreshStatus;
}

export interface RefreshOptions {
  /** Current or registration term (ingest guard strictness). Default: resolved by the ingest. */
  hot?: boolean;
  /**
   * Checked against the term's meta once the lease is held: when false, another instance already did the work
   * and the refresh reports "fresh" (or "waiting", after its failure) without fetching. Default: always due.
   */
  due?: (meta: TermMeta | null) => boolean;
}

const inflight = new Map<TermCode, Promise<RefreshOutcome>>();
const coldFailures = new Map<TermCode, number>();
/** Real-clock ms until which another instance is known to hold the term's lease. */
const lockedUntil = new Map<TermCode, number>();
const waits = new Map<TermCode, Promise<TermMeta | null>>();
let ingestDeps: IngestDeps = defaultIngestDeps;
let coldDeadlineMs = COLD_DEADLINE_MS;

onCatalogReset(() => {
  inflight.clear();
  coldFailures.clear();
  lockedUntil.clear();
  waits.clear();
  ingestDeps = defaultIngestDeps;
  coldDeadlineMs = COLD_DEADLINE_MS;
});

/** Tests: replace how pages are fetched (pagination, guard and timeout tests). Reset by resetCatalogState(). */
export function setIngestDepsForTests(deps: Partial<IngestDeps>): void {
  ingestDeps = { ...defaultIngestDeps, ...deps };
}

/** Tests: shorten the cold-read deadline (hanging-upstream tests). Reset by resetCatalogState(). */
export function setColdDeadlineForTests(ms: number): void {
  coldDeadlineMs = ms;
}

/** Another instance holds the term's lease (as last seen here). */
export function isLockedElsewhere(term: TermCode): boolean {
  const until = lockedUntil.get(term);
  if (until === undefined) return false;
  if (Date.now() < until) return true;
  lockedUntil.delete(term);
  return false;
}

function lockedOutcome(term: TermCode, meta: TermMeta | null): RefreshOutcome {
  return { term, status: "locked", sectionCount: meta?.sectionCount ?? 0 };
}

/** Refresh one term now: single flight in this process, and only while holding the term's lease. */
export function refreshTerm(term: TermCode, options: RefreshOptions = {}): Promise<RefreshOutcome> {
  const running = inflight.get(term);
  if (running) return running;
  const promise = (async (): Promise<RefreshOutcome> => {
    if (isLockedElsewhere(term)) return lockedOutcome(term, await getTermMeta(term));
    const owner = await acquireTermLease(term);
    if (!owner) {
      const meta = await readTermMeta(term);
      const until = Math.min(meta?.lockUntil?.getTime() ?? 0, Date.now() + LOCK_MEMO_MS);
      if (until > Date.now()) lockedUntil.set(term, until);
      return lockedOutcome(term, meta);
    }
    lockedUntil.delete(term);
    try {
      if (options.due) {
        // The meta memo may be seconds old: another instance may have refreshed the term meanwhile.
        const latest = await readTermMeta(term);
        if (!options.due(latest)) {
          return {
            term,
            status:
              latest?.lastSuccessAt && isFresh(latest, options.hot ?? true) ? "fresh" : "waiting",
            sectionCount: latest?.sectionCount ?? 0,
          };
        }
      }
      return await ingestTerm(
        term,
        ingestDeps,
        options.hot === undefined ? {} : { hot: options.hot },
      );
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

async function pollOtherInstance(term: TermCode, deadline: number): Promise<TermMeta | null> {
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, COLD_POLL_MS));
    const meta = await readTermMeta(term);
    if (meta?.lastSuccessAt) return meta;
    // Lease released (or expired) without a success: that refresh failed.
    if (!meta?.lockUntil || meta.lockUntil.getTime() <= Date.now()) return null;
  }
  return null;
}

/**
 * Another instance holds the lease of a term that was never ingested: wait (until `deadline`) for its result
 * instead of fetching a second time. One poll per term, shared by every waiting read.
 */
function waitForOtherInstance(term: TermCode, deadline: number): Promise<TermMeta | null> {
  let wait = waits.get(term);
  if (!wait) {
    const started = pollOtherInstance(term, deadline);
    wait = started;
    waits.set(term, started);
    const settle = () => {
      if (waits.get(term) === started) waits.delete(term);
    };
    started.then(settle, settle);
  }
  return wait;
}

const TIMED_OUT = Symbol("timed out");

/** `promise`'s value, or TIMED_OUT once the real-clock `deadline` passes (the promise keeps running). */
async function beforeDeadline<T>(
  promise: Promise<T>,
  deadline: number,
): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), Math.max(0, deadline - Date.now()));
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function coldLoad(term: TermCode, resolved: ResolvedTerms): Promise<TermMeta> {
  const failedUntil = coldFailures.get(term) ?? 0;
  if (Date.now() < failedUntil) throw scheduleUnavailable();
  const deadline = Date.now() + coldDeadlineMs;
  const refresh = refreshTerm(term, {
    hot: isHotTerm(term, resolved),
    due: (meta) => !meta?.lastSuccessAt,
  });
  const outcome = await beforeDeadline(refresh, deadline);
  if (outcome === TIMED_OUT) {
    // Keep the load alive past the response (after()); the next read joins it or finds the term loaded, and
    // fails fast for a while if it ends up failing.
    runInBackground(`cold load ${term}`, async () => {
      const late = await refresh;
      if (late.status === "failed" || late.status === "rejected") {
        coldFailures.set(term, Date.now() + COLD_FAILURE_TTL_MS);
      }
    });
    throw scheduleUnavailable();
  }
  const meta =
    outcome.status === "locked"
      ? await waitForOtherInstance(term, deadline)
      : await readTermMeta(term);
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
  if (!meta?.lastSuccessAt) return coldLoad(term, resolved);
  const hot = isHotTerm(term, resolved);
  if (hot && isRefreshDue(meta, true) && !inflight.has(term) && !isLockedElsewhere(term)) {
    runInBackground(`refresh ${term}`, () =>
      refreshTerm(term, { hot: true, due: (latest) => isRefreshDue(latest, true) }),
    );
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
      for (const term of terms) {
        await refreshTerm(term, {
          hot: isHotTerm(term, resolved),
          due: (meta) => !meta?.lastSuccessAt,
        });
      }
    })().finally(() => {
      backfilling = null;
    });
    await backfilling;
  });
}
