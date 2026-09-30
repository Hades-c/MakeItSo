import "server-only";
import mongoose from "mongoose";
import { getServerSession, type Session } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { isDavidsonEmail } from "@/lib/api/account";
import { queryString, routes } from "@/lib/routes";
import User from "@/models/User";
import { getAuthOptions } from "@/server/auth/options";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";

/**
 * Who is signed in (PLAN §2 "Auth", §6.1 W3 "Sessions").
 *
 * The session is a 14-day JWT (server/auth/options.ts) carrying the account's `sessionVersion` from sign-in time.
 * Every read loads the account and compares: "Sign out everywhere", a password change or reset, and account
 * deletion bump (or remove) the stored value, which revokes every JWT issued before. A JWT from before this
 * check existed has no version, and an account that was never bumped has none either: both count as 0, so nobody
 * is signed out by the upgrade itself.
 *
 * Name and e-mail come from the database, not the token, so a profile change shows up on the next request.
 */

/** The signed-in user as the rest of the server sees it. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** ISO time the mailbox was verified; null when it is not (optional: tests and older callers omit it). */
  emailVerifiedAt?: string | null;
}

/** Anything that may carry an `emailVerifiedAt` (a SessionUser, a lean User document, a Profile). */
export interface VerifiableAccount {
  email?: string;
  emailVerifiedAt?: Date | string | null;
}

/** The mailbox is verified (any address, legacy non-Davidson ones included). */
export function isEmailVerified(account: VerifiableAccount | null | undefined): boolean {
  const value = account?.emailVerifiedAt;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Verified mailbox AND an @davidson.edu address: the gate for alumni data, cold e-mail and AI (PLAN §1). */
export function isVerifiedDavidsonUser(account: VerifiableAccount | null | undefined): boolean {
  return isEmailVerified(account) && isDavidsonEmail(account?.email ?? "");
}

function toIso(value: unknown): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

/**
 * Turn a NextAuth session into the current user, checking it against the database: null when there is no
 * session, the account is gone, or the session's version is older than the account's.
 */
export async function resolveSessionUser(session: Session | null): Promise<SessionUser | null> {
  const claim = session?.user;
  if (!claim?.id || !mongoose.isValidObjectId(claim.id)) return null;
  await getDb();
  const doc = await User.findById(claim.id)
    .select("name email sessionVersion emailVerifiedAt")
    .lean();
  if (!doc) return null;
  if ((doc.sessionVersion ?? 0) !== (claim.sessionVersion ?? 0)) return null;
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name ?? "",
    emailVerifiedAt: toIso(doc.emailVerifiedAt),
  };
}

/**
 * The current user, or null when signed out, revoked, or deleted. Memoised per request with React cache(), so a
 * layout and its page share one session lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Session-dependent output is per request: opt out of prerendering before touching the auth config, so
  // `next build` never evaluates (or needs) NEXTAUTH_SECRET.
  await connection();
  return resolveSessionUser(await getServerSession(getAuthOptions()));
});

export interface RequireUserOptions {
  /**
   * Also require a verified @davidson.edu mailbox (alumni pages, AI pages). Other accounts are sent to /verify,
   * which explains the rule and offers the code.
   */
  verifiedDavidson?: boolean;
}

/** Where requireUser({ verifiedDavidson: true }) sends accounts that do not qualify. */
export const VERIFIED_ONLY_REDIRECT = `${routes.verify()}${queryString({ reason: "davidson" })}`;

/**
 * For server components, layouts and server actions: returns the signed-in user or redirects to /login (and,
 * with `verifiedDavidson`, to /verify?reason=davidson). Route handlers use requireApiUser() or defineRoute's auth
 * modes, which answer 401/403 rather than redirecting.
 */
export async function requireUser(options: RequireUserOptions = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(routes.login());
  if (options.verifiedDavidson && !isVerifiedDavidsonUser(user)) redirect(VERIFIED_ONLY_REDIRECT);
  return user;
}

/**
 * For route handlers (defineRoute does this for auth "user"): returns the signed-in user or throws ApiError(401),
 * which defineRoute turns into `{ error: { code: "unauthorized", ... } }` with status 401.
 */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return user;
}
