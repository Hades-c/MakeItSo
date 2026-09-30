import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { isDavidsonEmail } from "@/lib/api/account";
import type { AuthMode } from "@/lib/api/spec";
import User from "@/models/User";
import { requireApiUser, type SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { readEnv } from "@/server/env";
import { ApiError } from "@/server/http/errors";

/**
 * Route authorisation for defineRoute (PLAN §1 capability gating, §4.1.9).
 *   public   → null (never touches cookies)
 *   user     → the session user (401 otherwise)
 *   verified → the session user whose mailbox is verified (emailVerifiedAt) AND whose address is @davidson.edu
 *   admin    → the session user with a verified mailbox whose address is in ADMIN_EMAILS
 *   cron     → null, after checking `Authorization: Bearer $CRON_SECRET` (503 while unset)
 *
 * `emailVerifiedAt` is added to the User model by W3; until then it is read defensively from the raw document
 * (absent → unverified), so "verified" routes answer 403 for everyone.
 */

export const UNVERIFIED_MESSAGE =
  "The alumni network and AI features are limited to verified @davidson.edu accounts.";

interface AccountFlags {
  email: string;
  emailVerified: boolean;
}

/** Read the account's e-mail and verification state straight from the users collection. */
export async function readAccountFlags(userId: string): Promise<AccountFlags | null> {
  if (!mongoose.isValidObjectId(userId)) return null;
  await getDb();
  const doc = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { projection: { email: 1, emailVerifiedAt: 1 } },
  );
  if (!doc) return null;
  const verifiedAt: unknown = doc.emailVerifiedAt;
  const emailVerified =
    verifiedAt instanceof Date
      ? !Number.isNaN(verifiedAt.getTime())
      : typeof verifiedAt === "string" && !Number.isNaN(Date.parse(verifiedAt));
  return { email: typeof doc.email === "string" ? doc.email : "", emailVerified };
}

/** Signed in + verified mailbox + @davidson.edu address. */
export async function isVerifiedDavidson(userId: string): Promise<boolean> {
  const flags = await readAccountFlags(userId);
  return !!flags && flags.emailVerified && isDavidsonEmail(flags.email);
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** `Authorization: Bearer <CRON_SECRET>`, compared in constant time. */
export function assertCronRequest(request: Request): void {
  const secret = readEnv("CRON_SECRET");
  if (!secret) throw new ApiError(503, "unavailable", "Scheduled jobs are not configured.");
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const provided = match?.[1] ?? "";
  // Hash both sides so the comparison is constant-time and length-independent.
  if (!provided || !timingSafeEqual(sha256(provided), sha256(secret))) {
    throw new ApiError(401, "unauthorized", "Missing or invalid cron credentials.");
  }
}

export type RouteUser<A extends AuthMode> = A extends "user" | "verified" | "admin"
  ? SessionUser
  : null;

export async function resolveRouteUser<A extends AuthMode>(
  mode: A,
  request: Request,
): Promise<RouteUser<A>> {
  switch (mode) {
    case "public":
      return null as RouteUser<A>;
    case "cron":
      assertCronRequest(request);
      return null as RouteUser<A>;
    case "user":
      return (await requireApiUser()) as RouteUser<A>;
    case "verified": {
      const user = await requireApiUser();
      if (!(await isVerifiedDavidson(user.id)))
        throw new ApiError(403, "forbidden", UNVERIFIED_MESSAGE);
      return user as RouteUser<A>;
    }
    case "admin": {
      const user = await requireApiUser();
      const flags = await readAccountFlags(user.id);
      const admins = readEnv("ADMIN_EMAILS");
      if (!flags?.emailVerified || !admins.includes(flags.email.toLowerCase())) {
        throw new ApiError(403, "forbidden", "This action is limited to administrators.");
      }
      return user as RouteUser<A>;
    }
    default: {
      const unknownMode: never = mode;
      throw new Error(`Unknown auth mode: ${String(unknownMode)}`);
    }
  }
}
