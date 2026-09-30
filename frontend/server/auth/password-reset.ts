import "server-only";
import type { CheckInboxResponse } from "@/app/(auth)/_lib/contracts";
import User from "@/models/User";
import { CODE_SENDS_PER_HOUR, consumeCode, issueCode } from "@/server/auth/codes";
import { runAfterResponse } from "@/server/auth/defer";
import { passwordResetEmail } from "@/server/auth/emails";
import { getMailer } from "@/server/auth/mailer";
import { findAccountByEmail } from "@/server/auth/options";
import { hashPassword, passwordProblem } from "@/server/auth/passwords";
import { clearLoginFailures } from "@/server/auth/rate-limits";
import { now } from "@/server/clock";
import { trusted } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { consumeRateLimit } from "@/server/http/rate-limit";

/**
 * "Forgot password" with a mail provider (PLAN §6.1 W3): a 6-digit code (VerificationCode purpose
 * "reset-password": 15 minutes, 5 attempts, 3 sends per hour per account) e-mailed to the account's address, then
 * the code + a new password. Without a mail provider both steps answer 503 and /forgot-password explains how to
 * reach the maintainers instead.
 *
 * Enumeration safety: the request always answers the same 202, and the account lookup and e-mail happen after
 * the response; the confirmation answers every failure (unknown address, wrong, expired or exhausted code) with
 * the same 400.
 *
 * A successful reset sets the new password, bumps sessionVersion (signs out every device), ends the sign-in
 * backoff and marks the mailbox verified if it was not: the code reached that inbox. That is also how the owner
 * of an address takes over an unverified sign-up someone else started with it.
 */

export const RESET_UNAVAILABLE_MESSAGE =
  "Password reset by email is not available yet. Contact the MakeItSo maintainers to reset your password.";
export const RESET_CHECK_INBOX_MESSAGE =
  "If an account uses that address, we sent it a reset code. Check your inbox (and your spam folder).";
export const RESET_CODE_MESSAGE =
  "That code is not right, has expired, or was used too many times. Ask for a new code.";

export async function requestPasswordReset(email: string): Promise<CheckInboxResponse> {
  const at = now();
  const mailer = getMailer(() => at);
  if (!mailer) throw new ApiError(503, "unavailable", RESET_UNAVAILABLE_MESSAGE);
  await runAfterResponse("password reset e-mail", async () => {
    const user = await findAccountByEmail(email);
    if (!user) return;
    const userId = user._id.toString();
    const sends = await consumeRateLimit(
      `reset-send:user:${userId}`,
      CODE_SENDS_PER_HOUR,
      3600,
      at,
    );
    if (!sends.allowed) return;
    const code = await issueCode(userId, user.email, "reset-password", at);
    await mailer.send(passwordResetEmail(user.email, code));
  });
  return { status: "check-inbox", message: RESET_CHECK_INBOX_MESSAGE };
}

function badCode(): ApiError {
  return new ApiError(400, "validation_failed", "Some fields are invalid.", [
    { path: "code", message: RESET_CODE_MESSAGE },
  ]);
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
  const user = await findAccountByEmail(email);
  if (!user) throw badCode();
  const userId = user._id.toString();
  const check = await consumeCode(userId, "reset-password", code, at);
  if (!check.ok || check.email !== user.email) throw badCode();

  const hash = await hashPassword(newPassword);
  await User.updateOne(
    { _id: user._id },
    { $set: { password: hash }, $inc: { sessionVersion: 1 } },
  );
  await User.updateOne(
    { _id: user._id, email: check.email, emailVerifiedAt: trusted({ $not: { $type: "date" } }) },
    { $set: { emailVerifiedAt: at } },
  );
  await clearLoginFailures(user.email);
}
