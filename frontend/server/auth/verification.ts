import "server-only";
import mongoose from "mongoose";
import User from "@/models/User";
import {
  CODE_SENDS_PER_HOUR,
  consumeCode,
  issueCode,
  markCodeSent,
  type CodeCheck,
} from "@/server/auth/codes";
import { verificationEmail } from "@/server/auth/emails";
import { getMailer } from "@/server/auth/mailer";
import { codeGuessesExhausted, consumeAuthLimit, describeWait } from "@/server/auth/rate-limits";
import { isEmailVerified } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ApiError } from "@/server/http/errors";

/**
 * Mailbox verification (PLAN §1 compensating control, §6.1 W3, §9 "Account data"). Any existing account may
 * verify its own mailbox — legacy non-Davidson ones included, so the owner's address can satisfy ADMIN_EMAILS —
 * but only a verified @davidson.edu address counts as "verified" for alumni and AI (isVerifiedDavidsonUser).
 *
 * The signed-in student asks for a code (3 per hour: consumeRateLimit("verify-resend:user:<id>", 3, 3600); the
 * first one sent at registration and, while unverified, password-reset codes count too) and enters it (5
 * attempts per code, 15 minutes, and at most 10 wrong codes a day per account across verification and reset).
 * The account is marked only while it still exists and is unverified, in one atomic update: "first to verify
 * wins" against a parallel replacement of a stale sign-up (server/auth/registration.ts).
 *
 * Verifying keeps the account's profile: the person verifying is signed in (knows the password) and read the
 * code in the inbox, so they are both the registrant and the mailbox owner. A password reset, which needs only
 * the inbox, is different: see server/auth/password-reset.ts.
 */

/** "Too many wrong codes …" with when the account's daily budget of 10 comes back. */
export function tooManyWrongCodesMessage(retryAfterSec: number): string {
  const wait =
    retryAfterSec >= 3600
      ? `${Math.ceil(retryAfterSec / 3600)} hour${Math.ceil(retryAfterSec / 3600) === 1 ? "" : "s"}`
      : describeWait(retryAfterSec);
  return `Too many wrong codes for this account. You can ask for a new code in ${wait}.`;
}

export const VERIFICATION_UNAVAILABLE_MESSAGE =
  "Email verification is not available yet. You can use the catalog and your plan in the meantime; the alumni network and AI features need a verified @davidson.edu account.";

export interface VerifyResult {
  verified: true;
  emailVerifiedAt: string;
}

/** The ApiError for a failed code check (verification and password reset use the same wording). */
export function codeError(check: Exclude<CodeCheck, { ok: true }>): ApiError {
  if (check.reason === "locked") return lockedError(check.retryAfterSec ?? 86_400);
  if (
    check.reason === "too_many_attempts" ||
    (check.reason === "mismatch" && check.attemptsLeft === 0)
  ) {
    return new ApiError(429, "rate_limited", "Too many wrong codes. Ask for a new code.");
  }
  const message =
    check.reason === "mismatch"
      ? `That code is not right. ${check.attemptsLeft} attempt${check.attemptsLeft === 1 ? "" : "s"} left.`
      : "This code has expired or was already used. Ask for a new code.";
  return new ApiError(400, "validation_failed", "Some fields are invalid.", [
    { path: "code", message },
  ]);
}

function lockedError(retryAfterSec: number): ApiError {
  return new ApiError(429, "rate_limited", tooManyWrongCodesMessage(retryAfterSec), undefined, {
    "Retry-After": String(retryAfterSec),
  });
}

async function loadAccount(userId: string) {
  if (!mongoose.isValidObjectId(userId))
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  await getDb();
  const user = await User.findById(userId).select("email emailVerifiedAt").lean();
  if (!user) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return user;
}

/** Check the code and mark the mailbox verified. Already verified → the same success answer. */
export async function verifyEmailCode(userId: string, code: string): Promise<VerifyResult> {
  const at = now();
  const user = await loadAccount(userId);
  if (isEmailVerified(user)) {
    return { verified: true, emailVerifiedAt: (user.emailVerifiedAt as Date).toISOString() };
  }
  const check = await consumeCode(userId, "verify-email", code, at);
  if (!check.ok) throw codeError(check);
  if (check.email !== user.email) {
    // The code went to another address (the account's address changed since): it proves nothing about this one.
    throw codeError({ ok: false, reason: "missing", attemptsLeft: 0 });
  }
  const updated = await User.findOneAndUpdate(
    { _id: user._id, email: user.email, emailVerifiedAt: trusted({ $not: { $type: "date" } }) },
    { $set: { emailVerifiedAt: at } },
    { returnDocument: "after" },
  )
    .select("emailVerifiedAt")
    .lean();
  const final = updated ?? (await User.findById(userId).select("emailVerifiedAt").lean());
  if (!final) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  if (!isEmailVerified(final)) {
    throw new ApiError(409, "conflict", "Your account changed while verifying. Try again.");
  }
  return { verified: true, emailVerifiedAt: (final.emailVerifiedAt as Date).toISOString() };
}

/**
 * E-mail a new code to the signed-in account. {sent: false} when it is already verified; 503 without a mail
 * provider or when the provider fails; 429 (Retry-After) after 3 sends in an hour.
 */
export async function resendVerification(userId: string): Promise<{ sent: boolean }> {
  const at = now();
  const user = await loadAccount(userId);
  if (isEmailVerified(user)) return { sent: false };
  const mailer = getMailer(() => at);
  if (!mailer) throw new ApiError(503, "unavailable", VERIFICATION_UNAVAILABLE_MESSAGE);
  const budget = await codeGuessesExhausted(userId, at, "verify-email");
  if (budget.exhausted) throw lockedError(budget.retryAfterSec);
  const sends = await consumeAuthLimit(
    `verify-resend:user:${userId}`,
    CODE_SENDS_PER_HOUR,
    3600,
    at,
  );
  if (!sends.allowed) {
    throw new ApiError(
      429,
      "rate_limited",
      "You asked for 3 codes in the last hour. Use the newest one, or wait a little before asking again.",
      undefined,
      { "Retry-After": String(sends.retryAfterSec) },
    );
  }
  const code = await issueCode(userId, user.email, "verify-email", at);
  try {
    await mailer.send(verificationEmail(user.email, code));
  } catch (error) {
    console.error("[auth] could not send a verification code:", error);
    throw new ApiError(
      503,
      "unavailable",
      "We could not send the email. Try again in a few minutes.",
    );
  }
  await markCodeSent(userId, at);
  return { sent: true };
}
