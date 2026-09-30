import "server-only";
import type { Types } from "mongoose";
import type { CheckInboxResponse } from "@/app/(auth)/_lib/contracts";
import User from "@/models/User";
import { eraseAccountData } from "@/server/account/erasers";
import { issueCode, CODE_SENDS_PER_HOUR } from "@/server/auth/codes";
import { runAfterResponse } from "@/server/auth/defer";
import {
  alreadyRegisteredEmail,
  signupPendingEmail,
  verificationEmail,
} from "@/server/auth/emails";
import { getMailer, type Mailer } from "@/server/auth/mailer";
import { hashPassword, passwordProblem } from "@/server/auth/passwords";
import { defaultGraduationYear } from "@/server/auth/profile";
import { consumeMailAllowance } from "@/server/auth/rate-limits";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ApiError, isDuplicateKeyError } from "@/server/http/errors";
import { consumeRateLimit } from "@/server/http/rate-limit";

/**
 * Registration (PLAN §1 "Sign-up", §6.1 W3). The route validates the body with accountApi.register
 * (@davidson.edu only, NFKC → trim → lower case, 10–72 byte passwords) and rate-limits it (5/h per IP); this
 * module decides what happens, and ALWAYS answers the same 202 "check your inbox" whatever the address's state:
 *
 *   no account                 → create it (emailVerifiedAt: null) and e-mail a verification code
 *   verified or legacy account → nothing changes; e-mail "you already have an account — sign in"
 *   unverified, < 24 h old     → nothing changes; e-mail "a sign-up is waiting" (the inbox owner can take the
 *                                address over with Forgot password, which proves the mailbox)
 *   unverified, ≥ 24 h old     → replace it (its data is erased) with the new registration — only when mail is
 *                                available: without a mail provider nobody can verify, so nothing is ever
 *                                replaced (every account would otherwise be up for grabs after a day)
 *
 * "First to verify wins": the replacement deletes the old account only while it is still unverified (one atomic
 * findOneAndDelete), and verification marks an account only while it still exists (server/auth/verification.ts),
 * so a verification and a replacement can never both succeed. Legacy accounts (no emailVerifiedAt field, or
 * legacyAccount: true) are never replaced.
 *
 * Only new-password rules can reject a request (400 on the password field) and they never depend on the
 * address. Mail goes out after the response (runAfterResponse), at most 3 per hour per address.
 */

/** An unverified new-flow account older than this may be replaced by a new registration of its address. */
export const REPLACE_UNVERIFIED_AFTER_MS = 24 * 60 * 60 * 1000;

export const CHECK_INBOX_MESSAGE =
  "Check your Davidson inbox: we sent a message to that address. It has a verification code, or, if the address already has an account, how to sign in.";
export const NO_MAIL_MESSAGE =
  "If that address was free, your account is ready: sign in with the password you just chose. Email verification is not available yet.";

export interface RegisterInput {
  name: string;
  /** Already normalised and checked by DavidsonEmailSchema. */
  email: string;
  password: string;
  graduationYear?: number;
}

type Outcome = { kind: "created"; userId: string } | { kind: "exists" } | { kind: "pending" };

interface ExistingAccount {
  _id: Types.ObjectId;
  emailVerifiedAt?: Date | null;
  legacyAccount?: boolean;
  createdAt?: Date;
}

/** Stored `emailVerifiedAt: null` = a new-flow sign-up that is not verified; missing = legacy. */
function isPendingSignup(doc: ExistingAccount): boolean {
  return doc.emailVerifiedAt === null && doc.legacyAccount !== true;
}

function isReplaceable(doc: ExistingAccount, at: Date): boolean {
  return (
    isPendingSignup(doc) &&
    doc.createdAt instanceof Date &&
    doc.createdAt.getTime() <= at.getTime() - REPLACE_UNVERIFIED_AFTER_MS
  );
}

async function findExisting(email: string): Promise<ExistingAccount | null> {
  return User.findOne({ email }).select("_id emailVerifiedAt legacyAccount createdAt").lean();
}

async function replaceIfStillUnverified(existing: ExistingAccount, at: Date): Promise<boolean> {
  const cutoff = new Date(at.getTime() - REPLACE_UNVERIFIED_AFTER_MS);
  const removed = await User.findOneAndDelete({
    _id: existing._id,
    emailVerifiedAt: trusted({ $type: "null" }),
    legacyAccount: trusted({ $ne: true }),
    createdAt: trusted({ $lte: cutoff }),
  }).lean();
  if (!removed) return false;
  try {
    // Nobody can sign in to the removed account any more (its document is gone), so its data is unreachable;
    // erase it anyway. A failure is logged, not surfaced: the new registration must not depend on it.
    await eraseAccountData(removed._id.toString());
  } catch (error) {
    console.error("[auth] could not erase the data of a replaced unverified account:", error);
  }
  return true;
}

async function createOrResolve(
  input: RegisterInput,
  passwordHash: string,
  at: Date,
  canReplace: boolean,
): Promise<Outcome> {
  const existing = await findExisting(input.email);
  if (existing) {
    if (!(canReplace && isReplaceable(existing, at))) {
      return { kind: isPendingSignup(existing) ? "pending" : "exists" };
    }
    if (!(await replaceIfStillUnverified(existing, at))) {
      // Verified (or replaced by a parallel registration) in the meantime: first to verify wins.
      const current = await findExisting(input.email);
      return { kind: current && isPendingSignup(current) ? "pending" : "exists" };
    }
  }
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      password: passwordHash,
      emailVerifiedAt: null,
      sessionVersion: 0,
      graduationYear: input.graduationYear ?? defaultGraduationYear(at),
      // Legacy mirror for an Instant Rollback to the old app (models/User.ts).
      major: "Undecided",
    });
    return { kind: "created", userId: user._id.toString() };
  } catch (error) {
    // A parallel registration of the same address won the race.
    if (isDuplicateKeyError(error)) return { kind: "exists" };
    throw error;
  }
}

async function sendRegistrationMail(
  outcome: Outcome,
  email: string,
  mailer: Mailer,
  at: Date,
): Promise<void> {
  if (outcome.kind === "created") {
    // The first code counts against the same 3-per-hour send limit as "Send a new code".
    const sends = await consumeRateLimit(
      `verify-resend:user:${outcome.userId}`,
      CODE_SENDS_PER_HOUR,
      3600,
      at,
    );
    if (!sends.allowed) return;
    const code = await issueCode(outcome.userId, email, "verify-email", at);
    await mailer.send(verificationEmail(email, code));
    return;
  }
  if (!(await consumeMailAllowance("register-mail", email, at))) return;
  await mailer.send(
    outcome.kind === "exists" ? alreadyRegisteredEmail(email) : signupPendingEmail(email),
  );
}

/** Register (see the module comment). Throws ApiError(400) only for a password the policy rejects. */
export async function registerAccount(input: RegisterInput): Promise<CheckInboxResponse> {
  const at = now();
  const problem = passwordProblem(input.password, { email: input.email });
  if (problem) {
    throw new ApiError(400, "validation_failed", "Some fields are invalid.", [
      { path: "password", message: problem },
    ]);
  }
  const mailer = getMailer(() => at);
  // Hash before looking anything up, so every outcome costs the same bcrypt work.
  const passwordHash = await hashPassword(input.password);
  await getDb();
  const outcome = await createOrResolve(input, passwordHash, at, mailer !== null);
  if (mailer) {
    await runAfterResponse("registration e-mail", () =>
      sendRegistrationMail(outcome, input.email, mailer, at),
    );
  }
  return { status: "check-inbox", message: mailer ? CHECK_INBOX_MESSAGE : NO_MAIL_MESSAGE };
}
