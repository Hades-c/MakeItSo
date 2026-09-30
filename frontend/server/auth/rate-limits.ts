import "server-only";
import { createHash } from "node:crypto";
import { normalizeEmail } from "@/lib/api/account";
import RateLimit from "@/models/RateLimit";
import { getDb } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";
import {
  consumeRateLimit,
  rateLimitsOff,
  type RateLimitResult,
  type RateLimitRule,
} from "@/server/http/rate-limit";

/**
 * Auth rate limits (PLAN §6.1 W3), all in the `ratelimits` collection through the shared atomic fixed-window
 * helper (server/http/rate-limit.ts), plus the sign-in backoff streaks and the one-time-code guess budget.
 *
 *   sign-in          10 FAILED attempts / 15 min per client IP ("login:ip:<ip>"). Each attempt reserves a slot
 *                    before the password is checked (atomic, so parallel guesses cannot exceed the limit); a
 *                    successful sign-in, or an attempt refused before any check, gives its slot back. So a
 *                    shared campus address is not used up by students who simply sign in.
 *   sign-in backoff  per address AND client IP: after 5 failures, wait 30 s, 1, 2, 4, 8, then 15 min (cap) before
 *                    each further attempt from that IP. An attacker therefore backs off their own IP, not the
 *                    student's. Per address across all IPs, a much looser ceiling: after 100 failures in a streak,
 *                    at most one attempt a minute, except from an IP that signed in to that address successfully
 *                    in the last 30 days. Streaks end 24 h after their last failure; a success ends the IP's
 *                    streak, a password reset ends all of them. Never a hard lockout. Keys hash the address (and
 *                    the IP), so unknown addresses back off exactly like real ones (no "this account exists"
 *                    signal).
 *   registration     5 / h per client IP (defineRoute rule "register")
 *   e-mails          3 / h per address and kind ("register-mail:email:<hash>", "reset-mail:email:<hash>") on top
 *                    of the per-user code sends (verify-resend / reset-send: 3 / h, server/auth/codes.ts)
 *   code guesses     10 wrong one-time codes a day per account, all purposes together ("code-fail:user:<id>"),
 *                    on top of 5 attempts per code. Once used up, codes are neither checked nor sent until the
 *                    window ends.
 *   export 5 / day, password change and account deletion 10 / h, verification 30 / h (per user), password reset
 *   5 / h (request) and 10 / 15 min (confirm) per IP.
 *
 * Addresses and IPs in per-address keys are truncated sha256 hashes. Everything honours RATE_LIMITS=off
 * (fixtures-mode test knob). Client IPs come from clientIp(): x-real-ip / first X-Forwarded-For on Vercel only.
 *
 * Time: decisions use the `at` the caller got from server/clock.ts now(). The TTL field (`expiresAt`) is only a
 * purge time, computed with purgeTime() so that a pinned FIXTURES_NOW in the past never lets the TTL monitor
 * delete a counter that is still live for the code under test.
 */

export const LOGIN_IP_LIMIT = 10;
export const LOGIN_IP_WINDOW_SEC = 15 * 60;
export const LOGIN_BACKOFF_AFTER = 5;
export const LOGIN_BACKOFF_BASE_MS = 30_000;
export const LOGIN_BACKOFF_MAX_MS = 15 * 60_000;
export const LOGIN_STREAK_MS = 24 * 60 * 60_000;
/** Failures for one address (all IPs) before the address-wide pace applies. NIST 800-63B: at most 100. */
export const LOGIN_ADDRESS_CEILING = 100;
/** Address-wide pace once over the ceiling: one attempt per minute (IPs that signed in before are exempt). */
export const LOGIN_ADDRESS_INTERVAL_MS = 60_000;
/** How long an IP counts as "signed in to this address before". */
export const KNOWN_SIGN_IN_MS = 30 * 24 * 60 * 60_000;
export const MAIL_PER_ADDRESS_PER_HOUR = 3;
/** Wrong one-time codes per account per day, verification and password reset together. */
export const CODE_FAILURES_PER_DAY = 10;
export const CODE_FAILURE_WINDOW_SEC = 86_400;

export const REGISTER_RULE = { name: "register", limit: 5, windowSec: 3600, by: "ip" } as const;
export const EXPORT_RULE = { name: "export", limit: 5, windowSec: 86_400, by: "user" } as const;
export const PASSWORD_CHANGE_RULE = {
  name: "password-change",
  limit: 10,
  windowSec: 3600,
  by: "user",
} as const;
export const DELETE_ACCOUNT_RULE = {
  name: "delete-account",
  limit: 10,
  windowSec: 3600,
  by: "user",
} as const;
export const VERIFY_RULE = { name: "verify", limit: 30, windowSec: 3600, by: "user" } as const;
export const RESET_REQUEST_RULE = {
  name: "reset-request",
  limit: 5,
  windowSec: 3600,
  by: "ip",
} as const;
export const RESET_CONFIRM_RULE = {
  name: "reset-confirm",
  limit: 10,
  windowSec: 900,
  by: "ip",
} as const;

// Compile-time check that the rules fit defineRoute's shape.
const _rules: readonly RateLimitRule[] = [
  REGISTER_RULE,
  EXPORT_RULE,
  PASSWORD_CHANGE_RULE,
  DELETE_ACCOUNT_RULE,
  VERIFY_RULE,
  RESET_REQUEST_RULE,
  RESET_CONFIRM_RULE,
];
void _rules;

// ---- Time --------------------------------------------------------------------------------------------------------

/** How far server "now" may trail the real clock before a counter gets a later purge time (one TTL pass). */
const CLOCK_LAG_TOLERANCE_MS = 60_000;

/**
 * When the TTL monitor may delete a document whose logical lifetime ends at `logicalEnd` (decided with server
 * "now" `at`). In production now() is the real clock and this is `logicalEnd` (give or take the request's own
 * milliseconds). When "now" is pinned in the past (FIXTURES_NOW), it is pushed out to the real clock plus the
 * remaining lifetime, so the document outlives the test that uses it. Never a decision input, only a purge
 * time, which is why it reads the real clock.
 */
export function purgeTime(logicalEnd: Date, at: Date): Date {
  const remaining = logicalEnd.getTime() - at.getTime();
  return new Date(Math.max(logicalEnd.getTime(), Date.now() + remaining));
}

/** Start of the fixed window containing `at`, exactly as server/http/rate-limit.ts consumeRateLimit keys it. */
export function fixedWindowStart(at: Date, windowSec: number): Date {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(at.getTime() / windowMs) * windowMs);
}

// ---- Keys --------------------------------------------------------------------------------------------------------

function sha256(value: string, length: number): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, length);
}

/** Truncated sha256 of the normalised address: how addresses appear in rate-limit keys. */
export function emailKey(email: string): string {
  return sha256(normalizeEmail(email), 32);
}

/** Truncated sha256 of a client IP (per-address keys never hold the IP itself). */
export function ipKey(ip: string): string {
  return sha256(`ip:${ip}`, 16);
}

/**
 * The sign-in backoff streak for `email`: from one client IP when `ip` is given, else across all IPs (the
 * address ceiling).
 */
export function loginBackoffKey(email: string, ip?: string): string {
  const base = `login-backoff:email:${emailKey(email)}`;
  return ip === undefined ? base : `${base}:ip:${ipKey(ip)}`;
}

/** "This IP signed in to this address before" (exempts it from the address ceiling). */
export function knownSignInKey(email: string, ip: string): string {
  return `login-ok:email:${emailKey(email)}:ip:${ipKey(ip)}`;
}

export function codeFailureKey(userId: string): string {
  return `code-fail:user:${userId}`;
}

// ---- Fixed windows (reserve / release / peek) --------------------------------------------------------------------

/**
 * consumeRateLimit with a TTL that survives a pinned clock: when `at` trails the real clock, the counter's
 * `expiresAt` is pushed out with purgeTime() (one extra write, never in production).
 */
export async function consumeAuthLimit(
  key: string,
  limit: number,
  windowSec: number,
  at: Date,
): Promise<RateLimitResult> {
  const result = await consumeRateLimit(key, limit, windowSec, at);
  if (!rateLimitsOff() && Date.now() - at.getTime() > CLOCK_LAG_TOLERANCE_MS) {
    const windowStart = fixedWindowStart(at, windowSec);
    const windowEnd = new Date(windowStart.getTime() + windowSec * 1000);
    await RateLimit.collection.updateOne(
      { key, windowStart },
      { $max: { expiresAt: purgeTime(windowEnd, at) } },
    );
  }
  return result;
}

/** Give back one hit taken with consumeAuthLimit in the same window (a reservation that did not count). */
export async function releaseAuthLimit(key: string, windowSec: number, at: Date): Promise<void> {
  if (rateLimitsOff()) return;
  await getDb();
  await RateLimit.collection.updateOne(
    { key, windowStart: fixedWindowStart(at, windowSec), count: { $gt: 0 } },
    { $inc: { count: -1 } },
  );
}

/** Whether `key` has used up `limit` in the current window, without counting a hit. */
export async function peekAuthLimit(
  key: string,
  limit: number,
  windowSec: number,
  at: Date,
): Promise<{ exhausted: boolean; retryAfterSec: number }> {
  if (rateLimitsOff()) return { exhausted: false, retryAfterSec: 0 };
  await getDb();
  const windowStart = fixedWindowStart(at, windowSec);
  const doc = await RateLimit.collection.findOne({ key, windowStart });
  const count = typeof doc?.count === "number" ? doc.count : 0;
  const retryAfterSec = Math.max(
    1,
    Math.ceil((windowStart.getTime() + windowSec * 1000 - at.getTime()) / 1000),
  );
  return { exhausted: count >= limit, retryAfterSec };
}

// ---- Sign-in -----------------------------------------------------------------------------------------------------

/** Reserve one sign-in attempt from `ip` (given back with releaseLoginIpLimit when it did not fail). */
export function consumeLoginIpLimit(ip: string, now: Date): Promise<RateLimitResult> {
  return consumeAuthLimit(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_SEC, now);
}

/** The attempt reserved by consumeLoginIpLimit succeeded (or was refused unchecked): it does not count. */
export function releaseLoginIpLimit(ip: string, now: Date): Promise<void> {
  return releaseAuthLimit(`login:ip:${ip}`, LOGIN_IP_WINDOW_SEC, now);
}

/** Count one e-mail of `kind` to `email`; false = over 3 per hour (skip sending, answer as usual). */
export async function consumeMailAllowance(
  kind: "register-mail" | "reset-mail",
  email: string,
  now: Date,
): Promise<boolean> {
  const result = await consumeAuthLimit(
    `${kind}:email:${emailKey(email)}`,
    MAIL_PER_ADDRESS_PER_HOUR,
    3600,
    now,
  );
  return result.allowed;
}

/** Wait before the next attempt from one IP after `failures` failures in its streak (0 below 5). */
export function backoffDelayMs(failures: number): number {
  if (failures < LOGIN_BACKOFF_AFTER) return 0;
  const exponent = Math.min(failures - LOGIN_BACKOFF_AFTER, 10);
  return Math.min(LOGIN_BACKOFF_MAX_MS, LOGIN_BACKOFF_BASE_MS * 2 ** exponent);
}

/** Wait before the next attempt for the address from an IP that never signed in to it (0 below 100). */
export function addressCeilingDelayMs(failures: number): number {
  return failures >= LOGIN_ADDRESS_CEILING ? LOGIN_ADDRESS_INTERVAL_MS : 0;
}

/** Streak documents use a fixed windowStart (the unique index is key + windowStart). */
const STREAK_WINDOW_START = new Date(0);

interface Streak {
  failures: number;
  lastFailureAt: number;
}

async function readStreak(key: string, at: Date): Promise<Streak | null> {
  const doc = await RateLimit.collection.findOne({ key, windowStart: STREAK_WINDOW_START });
  if (!doc) return null;
  // `lastFailureAt` is the logical time; a document written before it existed only has the purge time.
  const last =
    doc.lastFailureAt instanceof Date
      ? doc.lastFailureAt.getTime()
      : doc.expiresAt instanceof Date
        ? doc.expiresAt.getTime() - LOGIN_STREAK_MS
        : Number.NaN;
  if (!Number.isFinite(last) || last + LOGIN_STREAK_MS <= at.getTime()) return null;
  return { failures: typeof doc.count === "number" ? doc.count : 0, lastFailureAt: last };
}

export interface BackoffStatus {
  /** Failures in this IP's streak for the address. */
  failures: number;
  /** Failures for the address from every IP. */
  addressFailures: number;
  /** True when the next attempt must wait. */
  blocked: boolean;
  retryAfterSec: number;
}

/** Whether a sign-in for `email` from `ip` must wait (see the module comment). */
export async function loginBackoffStatus(
  email: string,
  ip: string,
  at: Date,
): Promise<BackoffStatus> {
  if (rateLimitsOff()) return { failures: 0, addressFailures: 0, blocked: false, retryAfterSec: 0 };
  await getDb();
  const [pair, address] = await Promise.all([
    readStreak(loginBackoffKey(email, ip), at),
    readStreak(loginBackoffKey(email), at),
  ]);
  const nowMs = at.getTime();
  let waitUntil = pair ? pair.lastFailureAt + backoffDelayMs(pair.failures) : 0;
  if (address && addressCeilingDelayMs(address.failures) > 0) {
    const known = await RateLimit.collection.findOne({
      key: knownSignInKey(email, ip),
      windowStart: STREAK_WINDOW_START,
    });
    const knownUntil =
      known?.lastSignInAt instanceof Date ? known.lastSignInAt.getTime() + KNOWN_SIGN_IN_MS : 0;
    if (knownUntil <= nowMs) {
      waitUntil = Math.max(
        waitUntil,
        address.lastFailureAt + addressCeilingDelayMs(address.failures),
      );
    }
  }
  const waitMs = waitUntil - nowMs;
  return {
    failures: pair?.failures ?? 0,
    addressFailures: address?.failures ?? 0,
    blocked: waitMs > 0,
    retryAfterSec: waitMs > 0 ? Math.ceil(waitMs / 1000) : 0,
  };
}

async function addStreakFailure(key: string, at: Date): Promise<void> {
  const restartBefore = new Date(at.getTime() - LOGIN_STREAK_MS);
  const update = () =>
    RateLimit.collection.updateOne(
      { key, windowStart: STREAK_WINDOW_START },
      [
        {
          $set: {
            count: {
              $cond: [
                { $lte: [{ $ifNull: ["$lastFailureAt", STREAK_WINDOW_START] }, restartBefore] },
                1,
                { $add: [{ $ifNull: ["$count", 0] }, 1] },
              ],
            },
            lastFailureAt: at,
            expiresAt: purgeTime(new Date(at.getTime() + LOGIN_STREAK_MS), at),
          },
        },
      ],
      { upsert: true },
    );
  try {
    await update();
  } catch (error) {
    // Two first failures can race on the upsert; the loser retries as an update.
    if (!isDuplicateKeyError(error)) throw error;
    await update();
  }
}

/**
 * Add one failure to the address's streaks: this IP's and the address-wide one (atomic pipeline upserts: a
 * streak whose 24 h ended, but which the TTL monitor has not removed yet, restarts at 1).
 */
export async function recordLoginFailure(email: string, ip: string, at: Date): Promise<void> {
  if (rateLimitsOff()) return;
  await getDb();
  await Promise.all([
    addStreakFailure(loginBackoffKey(email, ip), at),
    addStreakFailure(loginBackoffKey(email), at),
  ]);
}

/**
 * A successful sign-in from `ip`: ends that IP's streak and remembers the IP for 30 days (exempt from the
 * address ceiling). The address-wide streak stays: someone else may still be guessing from elsewhere.
 */
export async function recordLoginSuccess(email: string, ip: string, at: Date): Promise<void> {
  if (rateLimitsOff()) return;
  await getDb();
  await Promise.all([
    RateLimit.collection.deleteOne({
      key: loginBackoffKey(email, ip),
      windowStart: STREAK_WINDOW_START,
    }),
    RateLimit.collection.updateOne(
      { key: knownSignInKey(email, ip), windowStart: STREAK_WINDOW_START },
      {
        $set: {
          count: 1,
          lastSignInAt: at,
          expiresAt: purgeTime(new Date(at.getTime() + KNOWN_SIGN_IN_MS), at),
        },
      },
      { upsert: true },
    ),
  ]);
}

/** A password reset ends every sign-in streak for the address (all IPs and the address-wide one). */
export async function clearLoginFailures(email: string): Promise<void> {
  if (rateLimitsOff()) return;
  await getDb();
  await RateLimit.collection.deleteMany({
    key: { $regex: `^${loginBackoffKey(email)}(?::ip:[a-f0-9]{16})?$` },
    windowStart: STREAK_WINDOW_START,
  });
}

// ---- One-time codes ----------------------------------------------------------------------------------------------

/**
 * Reserve one code guess for the account before the code is compared. `allowed: false` = the day's 10 wrong
 * codes are used up: do not compare. A guess that turns out right is given back with releaseCodeGuess.
 */
export function reserveCodeGuess(userId: string, at: Date): Promise<RateLimitResult> {
  return consumeAuthLimit(
    codeFailureKey(userId),
    CODE_FAILURES_PER_DAY,
    CODE_FAILURE_WINDOW_SEC,
    at,
  );
}

export function releaseCodeGuess(userId: string, at: Date): Promise<void> {
  return releaseAuthLimit(codeFailureKey(userId), CODE_FAILURE_WINDOW_SEC, at);
}

/** The account has no code guesses left today, so no new code is sent either. */
export function codeGuessesExhausted(
  userId: string,
  at: Date,
): Promise<{ exhausted: boolean; retryAfterSec: number }> {
  return peekAuthLimit(codeFailureKey(userId), CODE_FAILURES_PER_DAY, CODE_FAILURE_WINDOW_SEC, at);
}

export { describeWait } from "@/app/(auth)/_lib/sign-in-errors";
