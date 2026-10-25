import "server-only";
import mongoose from "mongoose";
import type { CheckInboxResponse } from "@/lib/api/account";
import User from "@/models/User";
import { eraseAccountData } from "@/server/account/erasers";
import {
  CODE_SENDS_PER_HOUR,
  consumeCode,
  consumeResetLink,
  findResetLink,
  issueResetCode,
  markCodeSent,
} from "@/server/auth/codes";
import { runAfterResponse } from "@/server/auth/defer";
import { passwordResetEmail } from "@/server/auth/emails";
import { getMailer } from "@/server/auth/mailer";
import { findAccountByEmail } from "@/server/auth/options";
import { hashPassword, passwordProblem } from "@/server/auth/passwords";
import { defaultGraduationYear } from "@/server/auth/profile";
import {
  clearLoginFailures,
  codeGuessesExhausted,
  consumeAuthLimit,
} from "@/server/auth/rate-limits";
import { isEmailVerified } from "@/server/auth/session";
import { now } from "@/server/clock";
import { trusted } from "@/server/db";
import { ApiError } from "@/server/http/errors";

/**
 * "Forgot password" with a mail provider (PLAN §6.1 W3): an e-mail to the account's address with a reset link and
 * a 6-digit code (VerificationCode purpose "reset-password": 15 minutes, one live send), then a new password with
 * the link's token (confirmPasswordResetLink) or with the address + code (confirmPasswordReset). Without a mail
 * provider every step answers 503 and /forgot-password explains how to reach the maintainers.
 *
 * Budgets: 3 reset e-mails an hour per verified account ("reset-send:user:<id>"); an unverified account's reset and
 * verification codes share ONE budget ("verify-resend:user:<id>"), because a reset also verifies the mailbox.
 * Wrong codes count against the code's 5 attempts and the account's 10 a day (server/auth/codes.ts); once those
 * are used up the code is not checked, and the e-mails carry the link alone until the window ends. The link has
 * no guess budget (its 128-bit secret cannot be guessed), so whoever knows a student's address can burn the code
 * guesses but never block the student's own reset (the abuse the owner asked to close, 2026-10-22).
 *
 * Enumeration safety: the request always answers the same 202, and the account lookup and e-mail happen after
 * the response. The confirmation hashes the new password first and runs the same code lookups for an unknown
 * address (against a throwaway id) as for a real one, then answers every failure (unknown address, wrong,
 * expired, exhausted or locked code) with the same 400.
 *
 * A successful reset sets the new password, bumps sessionVersion (signs out every device) and ends the sign-in
 * backoff. It also proves the mailbox, so it verifies the address, and that makes the reset a possible CHANGE OF
 * OWNER: only the inbox is needed, not the account's password.
 *   - A pending new sign-up (emailVerifiedAt stored as null, not legacy) may have been started by someone else
 *     with this address. The reset starts it fresh: its data is erased (every account-data eraser), the profile,
 *     consent, 18+ attestation and onboarding are cleared, and the name is reset (from the address), all in the
 *     same atomic update that verifies it. The inbox owner never inherits what the other person set up.
 *   - A legacy account that was never verified keeps its data (it predates the rewrite and is usually the
 *     student's own), but AI consent and the 18+ attestation are cleared when the reset verifies it: they must be
 *     given by the verified owner.
 *   - A verified account only gets the new password.
 */

export const RESET_UNAVAILABLE_MESSAGE =
  "Password reset by email is not available yet. Contact the MakeItSo maintainers to reset your password.";
export const RESET_CHECK_INBOX_MESSAGE =
  "If an account uses that address, we sent it a reset link and code. Check your inbox (and your spam folder).";
export const RESET_LINK_MESSAGE =
  "This reset link has expired, was already used, or a newer e-mail replaced it. Ask for a new one.";
export const RESET_CODE_MESSAGE =
  "That code is not right, has expired, or was used too many times. Ask for a new code.";

/** Profile, consent and onboarding fields a takeover of a pending sign-up clears (models/User.ts). */
const PENDING_SIGNUP_RESET_FIELDS = [
  "majors",
  "minors",
  "firstTerm",
  "standingOverride",
  "interests",
  "aiConsentAt",
  "adultAttestedAt",
  "onboardedAt",
  "verificationSentAt",
  "image",
  "minor",
  "currentYear",
  "bio",
  "careerInterests",
  "totalCreditsRequired",
] as const;

/** "casey.wildcat@davidson.edu" → "Casey Wildcat": the name a taken-over sign-up starts with (onboarding asks). */
export function nameFromEmail(email: string): string {
  const words = (email.split("@")[0] ?? "")
    .split(/[._+-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}']/gu, ""))
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const name = words.join(" ").slice(0, 100).trim();
  return name || "Davidson student";
}

function isPendingSignup(user: { emailVerifiedAt?: Date | null; legacyAccount?: boolean }) {
  return user.emailVerifiedAt === null && user.legacyAccount !== true;
}

export async function requestPasswordReset(email: string): Promise<CheckInboxResponse> {
  const at = now();
  const mailer = getMailer(() => at);
  if (!mailer) throw new ApiError(503, "unavailable", RESET_UNAVAILABLE_MESSAGE);
  await runAfterResponse("password reset e-mail", async () => {
    const user = await findAccountByEmail(email);
    if (!user) return;
    const userId = user._id.toString();
    // Codes locked for today (wrong-code budget used up): the e-mail still goes out, with the link alone.
    const codesLocked = (await codeGuessesExhausted(userId, at, "reset-password")).exhausted;
    const verified = isEmailVerified(user);
    const sends = await consumeAuthLimit(
      verified ? `reset-send:user:${userId}` : `verify-resend:user:${userId}`,
      CODE_SENDS_PER_HOUR,
      3600,
      at,
    );
    if (!sends.allowed) return;
    const { code, linkToken } = await issueResetCode(userId, user.email, at);
    await mailer.send(
      passwordResetEmail(
        user.email,
        { code: codesLocked ? null : code, linkToken },
        { pendingSignup: isPendingSignup(user) },
      ),
    );
    if (!verified) await markCodeSent(userId, at);
  });
  return { status: "check-inbox", message: RESET_CHECK_INBOX_MESSAGE };
}

function badCode(): ApiError {
  return new ApiError(400, "validation_failed", "Some fields are invalid.", [
    { path: "code", message: RESET_CODE_MESSAGE },
  ]);
}

/** Set the new password; for a pending sign-up, as a fresh start (see the module comment). */
async function applyReset(
  userId: mongoose.Types.ObjectId,
  codeEmail: string,
  passwordHash: string,
  at: Date,
): Promise<void> {
  const unset = Object.fromEntries(PENDING_SIGNUP_RESET_FIELDS.map((field) => [field, ""]));
  const takenOver = await User.findOneAndUpdate(
    {
      _id: userId,
      email: codeEmail,
      emailVerifiedAt: trusted({ $type: "null" }),
      legacyAccount: trusted({ $ne: true }),
    },
    {
      $set: {
        password: passwordHash,
        emailVerifiedAt: at,
        name: nameFromEmail(codeEmail),
        graduationYear: defaultGraduationYear(at),
        // Legacy mirror for an Instant Rollback, as registration writes it.
        major: "Undecided",
      },
      $unset: unset,
      $inc: { sessionVersion: 1 },
    },
  )
    .select("_id")
    .lean();
  if (takenOver) {
    try {
      // Every session of the previous holder is revoked (sessionVersion above), so nothing can write while this
      // runs. A failure is logged: the account is already the inbox owner's, and retrying needs no input.
      await eraseAccountData(userId.toString());
    } catch (error) {
      console.error("[auth] could not erase a taken-over sign-up's data:", error);
    }
    return;
  }
  await User.updateOne(
    { _id: userId },
    { $set: { password: passwordHash }, $inc: { sessionVersion: 1 } },
  );
  // Not verified before (a legacy account): the code proves the mailbox; consent must come from its owner.
  await User.updateOne(
    { _id: userId, email: codeEmail, emailVerifiedAt: trusted({ $not: { $type: "date" } }) },
    { $set: { emailVerifiedAt: at }, $unset: { aiConsentAt: "", adultAttestedAt: "" } },
  );
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const at = now();
  if (!getMailer(() => at)) throw new ApiError(503, "unavailable", RESET_UNAVAILABLE_MESSAGE);
  // The policy does not depend on the account, so it is checked first, for every request.
  const problem = passwordProblem(newPassword, { email });
  if (problem) {
    throw new ApiError(400, "validation_failed", "Some fields are invalid.", [
      { path: "newPassword", message: problem },
    ]);
  }
  // Hash before the lookup so every answer costs the same bcrypt work, and check a code for an unknown address
  // too (a throwaway id matches nothing), so known and unknown addresses do the same database work.
  const passwordHash = await hashPassword(newPassword);
  const user = await findAccountByEmail(email);
  const userId = user ? user._id.toString() : new mongoose.Types.ObjectId().toString();
  const check = await consumeCode(userId, "reset-password", code, at);
  if (!user || !check.ok || check.email !== user.email) throw badCode();

  await applyReset(user._id, check.email, passwordHash, at);
  await clearLoginFailures(user.email);
}

function badLink(): ApiError {
  return new ApiError(400, "validation_failed", "Some fields are invalid.", [
    { path: "token", message: RESET_LINK_MESSAGE },
  ]);
}

/**
 * The e-mailed link: its token + the new password. Returns the account's address (the page signs the student in
 * with it). The token is the proof, so there is no address to enumerate: a link that does not open a live reset
 * is a 400 on `token`, a weak password a 400 on `newPassword` that leaves the link usable. Neither the code's
 * attempts nor the daily wrong-code budget apply (see the module comment).
 */
export async function confirmPasswordResetLink(
  token: string,
  newPassword: string,
): Promise<{ email: string }> {
  const at = now();
  if (!getMailer(() => at)) throw new ApiError(503, "unavailable", RESET_UNAVAILABLE_MESSAGE);
  const link = await findResetLink(token, at);
  if (!link) throw badLink();
  const user = await User.findById(link.userId).select("_id email").lean();
  if (!user || user.email !== link.email) throw badLink();
  const problem = passwordProblem(newPassword, { email: user.email });
  if (problem) {
    throw new ApiError(400, "validation_failed", "Some fields are invalid.", [
      { path: "newPassword", message: problem },
    ]);
  }
  const passwordHash = await hashPassword(newPassword);
  if (!(await consumeResetLink(link, at))) throw badLink();
  await applyReset(user._id, link.email, passwordHash, at);
  await clearLoginFailures(user.email);
  return { email: user.email };
}
