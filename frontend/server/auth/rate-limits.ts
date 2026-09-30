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
 * helper (server/http/rate-limit.ts), plus the per-address sign-in backoff.
 *
 *   sign-in          10 attempts / 15 min per client IP                 ("login:ip:<ip>")
 *   sign-in backoff  after 5 failures for an address, wait 30 s, 1, 2, 4, 8, then 15 min (cap) before each
 *                    further attempt; the streak ends 24 h after the last failure or on a successful sign-in.
 *                    Never a hard lockout. Keyed by the address, not the account, so unknown addresses back
 *                    off exactly like real ones (no "this account exists" signal).
 *   registration     5 / h per client IP (defineRoute rule "register")
 *   e-mails          3 / h per address and kind ("register-mail:email:<hash>", "reset-mail:email:<hash>") on top
 *                    of the per-user code sends (verify-resend / reset-send: 3 / h, server/auth/codes.ts)
 *   export 5 / day, password change and account deletion 10 / h, verification 30 / h (per user), password reset
 *   5 / h (request) and 10 / 15 min (confirm) per IP.
 *
 * Addresses appear only as a truncated sha256 of the normalised address. Everything honours RATE_LIMITS=off
 * (fixtures-mode test knob). Client IPs come from clientIp(): x-real-ip / first X-Forwarded-For on Vercel only.
 */

export const LOGIN_IP_LIMIT = 10;
export const LOGIN_IP_WINDOW_SEC = 15 * 60;
export const LOGIN_BACKOFF_AFTER = 5;
export const LOGIN_BACKOFF_BASE_MS = 30_000;
export const LOGIN_BACKOFF_MAX_MS = 15 * 60_000;
export const LOGIN_STREAK_MS = 24 * 60 * 60_000;
export const MAIL_PER_ADDRESS_PER_HOUR = 3;

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

/** Truncated sha256 of the normalised address: how addresses appear in rate-limit keys. */
export function emailKey(email: string): string {
  return createHash("sha256").update(normalizeEmail(email), "utf8").digest("hex").slice(0, 32);
}

export function loginBackoffKey(email: string): string {
  return `login-backoff:email:${emailKey(email)}`;
}

/** Count one sign-in attempt from `ip`. */
export function consumeLoginIpLimit(ip: string, now: Date): Promise<RateLimitResult> {
  return consumeRateLimit(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_SEC, now);
}

/** Count one e-mail of `kind` to `email`; false = over 3 per hour (skip sending, answer as usual). */
export async function consumeMailAllowance(
  kind: "register-mail" | "reset-mail",
  email: string,
  now: Date,
): Promise<boolean> {
  const result = await consumeRateLimit(
    `${kind}:email:${emailKey(email)}`,
    MAIL_PER_ADDRESS_PER_HOUR,
    3600,
    now,
  );
  return result.allowed;
}

/** Wait before the next attempt after `failures` failures in a streak (0 below 5). */
export function backoffDelayMs(failures: number): number {
  if (failures < LOGIN_BACKOFF_AFTER) return 0;
  const exponent = Math.min(failures - LOGIN_BACKOFF_AFTER, 10);
  return Math.min(LOGIN_BACKOFF_MAX_MS, LOGIN_BACKOFF_BASE_MS * 2 ** exponent);
}

/** Backoff streak documents use a fixed windowStart (the unique index is key + windowStart). */
const STREAK_WINDOW_START = new Date(0);

export interface BackoffStatus {
  failures: number;
  /** True when the next attempt must wait. */
  blocked: boolean;
  retryAfterSec: number;
}

export async function loginBackoffStatus(email: string, now: Date): Promise<BackoffStatus> {
  if (rateLimitsOff()) return { failures: 0, blocked: false, retryAfterSec: 0 };
  await getDb();
  const doc = await RateLimit.collection.findOne({
    key: loginBackoffKey(email),
    windowStart: STREAK_WINDOW_START,
  });
  const expiresAt = doc?.expiresAt instanceof Date ? doc.expiresAt : null;
  if (!doc || !expiresAt || expiresAt.getTime() <= now.getTime()) {
    return { failures: 0, blocked: false, retryAfterSec: 0 };
  }
  const failures = typeof doc.count === "number" ? doc.count : 0;
  const lastFailureAt = expiresAt.getTime() - LOGIN_STREAK_MS;
  const waitUntil = lastFailureAt + backoffDelayMs(failures);
  const waitMs = waitUntil - now.getTime();
  return {
    failures,
    blocked: waitMs > 0,
    retryAfterSec: waitMs > 0 ? Math.ceil(waitMs / 1000) : 0,
  };
}

/**
 * Add one failure to the address's streak (atomic pipeline upsert: a streak whose 24 h expired, but which the TTL
 * monitor has not removed yet, restarts at 1).
 */
export async function recordLoginFailure(email: string, now: Date): Promise<void> {
  if (rateLimitsOff()) return;
  await getDb();
  const key = loginBackoffKey(email);
  const update = () =>
    RateLimit.collection.updateOne(
      { key, windowStart: STREAK_WINDOW_START },
      [
        {
          $set: {
            count: {
              $cond: [
                { $lte: [{ $ifNull: ["$expiresAt", STREAK_WINDOW_START] }, now] },
                1,
                { $add: [{ $ifNull: ["$count", 0] }, 1] },
              ],
            },
            expiresAt: new Date(now.getTime() + LOGIN_STREAK_MS),
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

/** A successful sign-in (or password reset) ends the streak. */
export async function clearLoginFailures(email: string): Promise<void> {
  if (rateLimitsOff()) return;
  await getDb();
  await RateLimit.collection.deleteOne({
    key: loginBackoffKey(email),
    windowStart: STREAK_WINDOW_START,
  });
}

/** "5 minutes" / "1 minute" / "30 seconds" for messages. */
export function describeWait(seconds: number): string {
  if (seconds < 60) {
    const s = Math.max(1, Math.ceil(seconds));
    return `${s} second${s === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
