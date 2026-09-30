import "server-only";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { AccountExportSchema } from "@/lib/api/account";
import User from "@/models/User";
import { eraseAccountData, exportAccountData } from "@/server/account/erasers";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/passwords";
import { isVerifiedDavidsonUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";

/**
 * Account management (PLAN §3 /profile, §6.1 W3 "Account data").
 *
 *   changePassword      current password required; new one passes the policy; bumps sessionVersion (every
 *                       device, this one included, must sign in again: the form signs in with the new password)
 *   signOutEverywhere   bumps sessionVersion
 *   deleteAccount       password re-entry; bumps sessionVersion first (no writes can race the erase), runs every
 *                       eraser in the registry (server/account/erasers.ts), then deletes the users document. If an
 *                       eraser fails the account stays (so the student can retry) and the error is a 500.
 *   exportAccount       the users document without the password hash + everything the registry exports
 * The routes clear the session cookie (clearSessionCookies) after sign-out-everywhere and deletion.
 */

export type AccountExport = ReturnType<(typeof AccountExportSchema)["parse"]>;

function objectId(userId: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(userId))
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return new mongoose.Types.ObjectId(userId);
}

async function loadWithPassword(userId: string) {
  await getDb();
  const user = await User.findById(objectId(userId)).select("+password email").lean();
  if (!user) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return user;
}

function wrongPassword(path: string): ApiError {
  return new ApiError(400, "validation_failed", "Some fields are invalid.", [
    { path, message: "That password is not right." },
  ]);
}

/** GET /api/me: who is signed in and what they may use. */
export async function getMe(userId: string): Promise<{
  me: { id: string; name: string; email: string; verifiedDavidson: boolean; onboarded: boolean };
}> {
  await getDb();
  const doc = await User.findById(objectId(userId))
    .select("name email emailVerifiedAt onboardedAt")
    .lean();
  if (!doc) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return {
    me: {
      id: doc._id.toString(),
      name: doc.name ?? "",
      email: doc.email,
      verifiedDavidson: isVerifiedDavidsonUser(doc),
      onboarded: doc.onboardedAt instanceof Date,
    },
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await loadWithPassword(userId);
  if (!(await verifyPassword(currentPassword, user.password)))
    throw wrongPassword("currentPassword");
  const problem =
    newPassword === currentPassword
      ? "Choose a password different from your current one."
      : passwordProblem(newPassword, { email: user.email });
  if (problem) {
    throw new ApiError(400, "validation_failed", "Some fields are invalid.", [
      { path: "newPassword", message: problem },
    ]);
  }
  const hash = await hashPassword(newPassword);
  await User.updateOne(
    { _id: user._id },
    { $set: { password: hash }, $inc: { sessionVersion: 1 } },
  );
}

export async function signOutEverywhere(userId: string): Promise<void> {
  await getDb();
  const result = await User.updateOne({ _id: objectId(userId) }, { $inc: { sessionVersion: 1 } });
  if (result.matchedCount === 0) throw new ApiError(401, "unauthorized", "Sign in to continue.");
}

export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await loadWithPassword(userId);
  if (!(await verifyPassword(password, user.password))) throw wrongPassword("password");
  // Revoke every session first, so nothing writes new data while the erasers run.
  await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
  await eraseAccountData(userId);
  await User.deleteOne({ _id: user._id });
}

/** JSON-safe copy (ObjectIds → hex strings, Dates → ISO strings, no undefined). */
function jsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

export async function exportAccount(userId: string): Promise<AccountExport> {
  await getDb();
  const doc = await User.findById(objectId(userId)).lean();
  if (!doc) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  // `password` is select:false; drop it anyway in case a projection ever changes.
  const { password: _password, ...profile } = doc as typeof doc & { password?: string };
  return AccountExportSchema.parse({
    exportedAt: now().toISOString(),
    profile: jsonSafe(profile),
    data: jsonSafe(await exportAccountData(userId)),
  });
}

// ---- Session cookies -----------------------------------------------------------------------------------------

/** NextAuth v4's session cookie names (the __Secure- prefix is used on https) and chunk suffixes. */
const SESSION_COOKIE_NAMES = ["next-auth.session-token", "__Secure-next-auth.session-token"];
const CHUNK_SUFFIXES = ["", ".0", ".1", ".2"];

/** Expire the NextAuth session cookies on `response` (the JWT is also revoked server-side). */
export function clearSessionCookies<T extends NextResponse>(response: T): T {
  for (const base of SESSION_COOKIE_NAMES) {
    for (const suffix of CHUNK_SUFFIXES) {
      response.cookies.set(`${base}${suffix}`, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        sameSite: "lax",
        secure: base.startsWith("__Secure-"),
      });
    }
  }
  return response;
}

/** 204 No Content that also signs this browser out. */
export function signedOutResponse(): NextResponse {
  return clearSessionCookies(new NextResponse(null, { status: 204 }));
}
