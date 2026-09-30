import "server-only";
import RateLimit from "@/models/RateLimit";
import { getDb } from "@/server/db";
import { readEnv } from "@/server/env";
import { ApiError, isDuplicateKeyError } from "@/server/http/errors";

/**
 * Atomic fixed-window rate limiting on MongoDB (PLAN §6.1 W3): one counter document per (key, window), incremented
 * with `findOneAndUpdate({$inc}, {upsert})`, removed by a TTL index when the window ends (rateLimitPurgeTime: on the
 * real clock, so a pinned FIXTURES_NOW never lets the monitor purge a live counter). Used by defineRoute's
 * `rateLimit` option and directly by services (e.g. per-account login backoff, the verification-code resend limit
 * `verify-resend:user:<id>` at 3 per hour).
 *
 * Test knob: RATE_LIMITS=off (server/env.ts; only with EXTERNAL_MODE=fixtures, never on Vercel production) makes
 * every check pass without touching the database. The Playwright server sets it: off Vercel every request shares
 * the "local" client-IP bucket, and the suite registers and signs in far more often than the real limits allow.
 * Unit tests keep limits on (the default) and test them directly.
 */

export interface RateLimitRule {
  /** Rule name, part of the key ("login", "register", "export", "ratings"). */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowSec: number;
  /** Count per client IP or per signed-in user (falls back to IP on public routes). */
  by: "ip" | "user";
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSec: number;
}

/** True when RATE_LIMITS=off (tests only; see the module comment). */
export function rateLimitsOff(): boolean {
  return readEnv("RATE_LIMITS") === "off";
}

/** How far `now` may trail the real clock before it counts as pinned (FIXTURES_NOW) for purge times. */
export const PINNED_CLOCK_LAG_MS = 60_000;

/**
 * When the TTL monitor may delete a counter whose window ends at `windowEnd`, decided at `now`. The monitor runs on
 * the real clock, so this is `windowEnd` in production, and max(windowEnd, real now + (windowEnd − now)) when `now`
 * trails the real clock by more than PINNED_CLOCK_LAG_MS (a pinned FIXTURES_NOW in the past): the counter then
 * outlives the test that uses it instead of being purged within a minute. Only a purge time, never a decision.
 */
export function rateLimitPurgeTime(windowEnd: Date, now: Date): Date {
  const realNow = Date.now();
  if (realNow - now.getTime() <= PINNED_CLOCK_LAG_MS) return windowEnd;
  return new Date(Math.max(windowEnd.getTime(), realNow + (windowEnd.getTime() - now.getTime())));
}

/** Count one hit on `key` and say whether it is within `limit` for the current `windowSec` window. */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSec: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  if (rateLimitsOff()) return { allowed: true, count: 0, remaining: limit, retryAfterSec: 0 };
  await getDb();
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const windowEnd = new Date(windowStart.getTime() + windowMs);
  const expiresAt = rateLimitPurgeTime(windowEnd, now);

  const bump = () =>
    RateLimit.findOneAndUpdate(
      { key, windowStart },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: "after" },
    ).lean();

  let doc;
  try {
    doc = await bump();
  } catch (error) {
    // Two first hits in the same window can race on the upsert; the loser retries as an update.
    if (!isDuplicateKeyError(error)) throw error;
    doc = await bump();
  }
  const count = doc?.count ?? 1;
  return {
    allowed: count <= limit,
    count,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000)),
  };
}

/**
 * The client IP for rate limiting. Only trusted on Vercel (x-real-ip, else the first X-Forwarded-For entry);
 * elsewhere the headers are client-controlled, so everything shares the "local" bucket.
 */
export function clientIp(request: Request): string {
  if (!readEnv("VERCEL_ENV")) return "local";
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/** Apply rules in order; throws ApiError(429) with Retry-After for the first rule that is over its limit. */
export async function enforceRateLimits(
  rules: readonly RateLimitRule[],
  request: Request,
  userId: string | null,
): Promise<void> {
  if (rateLimitsOff()) return;
  for (const rule of rules) {
    const subject = rule.by === "user" && userId ? `user:${userId}` : `ip:${clientIp(request)}`;
    const result = await consumeRateLimit(`${rule.name}:${subject}`, rule.limit, rule.windowSec);
    if (!result.allowed) {
      throw new ApiError(
        429,
        "rate_limited",
        "Too many requests. Please wait a moment and try again.",
        undefined,
        { "Retry-After": String(result.retryAfterSec) },
      );
    }
  }
}
