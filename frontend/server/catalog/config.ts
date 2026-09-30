import "server-only";
import { ApiError } from "@/server/http/errors";

/**
 * Catalog tuning (PLAN §5 "Catalog ingest"). Durations are milliseconds. Freshness is judged with the server clock
 * (`now()` from server/clock.ts, pinned in fixtures mode); leases and in-process memo caches use the real clock
 * (they are mechanics, not decisions, and must expire even while FIXTURES_NOW is pinned).
 */

/** First term ingested: Fall 2022 is the oldest term the API verifiably serves (PLAN §5). */
export const HISTORY_START = "202201";

/** Active (current) and registration terms are refreshed when older than this (stale-while-revalidate). */
export const HOT_TERM_TTL_MS = 15 * 60_000;
/** Past terms are refreshed by the nightly cron when older than this. */
export const PAST_TERM_TTL_MS = 20 * 60 * 60_000;
/** The upstream terms list is re-fetched when older than this. */
export const TERMS_TTL_MS = 6 * 60 * 60_000;
/** Filters (departments, requirements) are re-fetched when older than this. */
export const FILTERS_TTL_MS = 24 * 60 * 60_000;
/** After a failed attempt, background refreshes wait this long before trying again. */
export const RETRY_AFTER_MS = 5 * 60_000;

/** Upstream timeout per request (PLAN §5: 8 s). */
export const UPSTREAM_TIMEOUT_MS = 8_000;
/** A refresh lease outlives the slowest refresh (a few pages of 8 s each). */
export const LEASE_MS = 3 * 60_000;
/** A cold read that finds another instance loading the term waits at most this long for it. */
export const COLD_WAIT_MS = 9_000;
export const COLD_POLL_MS = 250;
/** After a failed cold load, reads of that term fail fast (503) for this long instead of retrying upstream. */
export const COLD_FAILURE_TTL_MS = 30_000;

/** In-process memo lifetimes (real clock). */
export const TERMS_MEMO_MS = 60_000;
export const META_MEMO_MS = 5_000;

/** The empty / < 50% guard (PLAN §5): a refresh smaller than this share of the stored term is rejected. */
export const MIN_REFRESH_RATIO = 0.5;
/** More malformed upstream items than this share (and at least MIN_INVALID) fails the refresh. */
export const MAX_INVALID_RATIO = 0.1;
export const MIN_INVALID = 5;

export const UNAVAILABLE_MESSAGE =
  "Schedule data is temporarily unavailable. Please try again in a few minutes.";

/** The 503 a cold read answers when the schedule cannot be loaded (never a hang). */
export function scheduleUnavailable(): ApiError {
  return new ApiError(503, "unavailable", UNAVAILABLE_MESSAGE);
}
