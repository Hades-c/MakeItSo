import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import type { Session, User as AuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { vi } from "vitest";
import User from "@/models/User";
import { getAuthOptions } from "@/server/auth/options";

/**
 * Shared helpers for the W3 tests (auth, account, profile). Route tests run the REAL session code
 * (server/auth/session.ts: database lookup + sessionVersion check); only NextAuth's cookie decoding is replaced,
 * by mocking `getServerSession` in each test file:
 *
 *   const auth = vi.hoisted(() => ({ session: null as Session | null }));
 *   vi.mock("next-auth", async (importOriginal) => ({
 *     ...(await importOriginal<Record<string, unknown>>()),
 *     getServerSession: async () => auth.session,
 *   }));
 *   ...
 *   auth.session = await sessionFor(user);   // what the real jwt + session callbacks produce at sign-in
 */

export const TEST_SECRET = "w3-test-secret-0123456789-abcdefghijklmnop";
export const ORIGIN = "http://localhost";
export const FIXTURE_NOW = "2026-09-30T12:00:00-04:00";

/** NEXTAUTH_SECRET for getAuthOptions() and the code HMAC (call in beforeEach: env stubs reset per test). */
export function stubAuthEnv(): void {
  vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET);
}

/** Move server "now" (server/clock.ts) by `ms` from the fixtures' day. */
export function stubNowPlus(ms: number): Date {
  const at = new Date(new Date(FIXTURE_NOW).getTime() + ms);
  vi.stubEnv("FIXTURES_NOW", at.toISOString());
  return at;
}

export interface TestUserInput {
  name?: string;
  email?: string;
  password?: string;
  /** Raw fields written straight to the collection (e.g. a legacy document shape, emailVerifiedAt: null). */
  raw?: Record<string, unknown>;
}

/** Insert a user through the driver (so legacy shapes are possible). Password hashed at cost 4 for speed. */
export async function insertUser(input: TestUserInput = {}): Promise<{
  id: string;
  email: string;
  name: string;
  password: string;
}> {
  const email = input.email ?? `sam-${new mongoose.Types.ObjectId().toString()}@davidson.edu`;
  const name = input.name ?? "Sam Student";
  const password = input.password ?? "a long test password";
  const doc = {
    name,
    email,
    password: await bcrypt.hash(password, 4),
    createdAt: new Date(FIXTURE_NOW),
    updatedAt: new Date(FIXTURE_NOW),
    ...input.raw,
  };
  const { insertedId } = await User.collection.insertOne(doc);
  return { id: insertedId.toString(), email, name, password };
}

/** The NextAuth session the real callbacks build for `user` at sign-in time. */
export async function sessionFor(user: {
  id: string;
  email: string;
  name: string;
  sessionVersion?: number;
}): Promise<Session> {
  const callbacks = getAuthOptions().callbacks!;
  const signedIn: AuthUser = { ...user, sessionVersion: user.sessionVersion ?? 0 };
  const token = (await callbacks.jwt!({
    token: {},
    user: signedIn,
    account: null,
    trigger: "signIn",
  } as Parameters<NonNullable<typeof callbacks.jwt>>[0])) as JWT;
  return (await callbacks.session!({
    session: { user: {}, expires: new Date(Date.now() + 86_400_000).toISOString() },
    token,
    user: signedIn,
    newSession: undefined,
    trigger: "update",
  } as unknown as Parameters<NonNullable<typeof callbacks.session>>[0])) as Session;
}

/** Current sessionVersion stored for the user (0 when missing). */
export async function storedSessionVersion(id: string): Promise<number> {
  const doc = await User.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
  return typeof doc?.sessionVersion === "number" ? doc.sessionVersion : 0;
}

export function jsonRequest(
  path: string,
  {
    method = "POST",
    body,
    headers = {},
  }: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Request {
  const hasBody = body !== undefined;
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

export function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers });
}

export interface ErrorBody {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

export async function errorOf(res: Response): Promise<ErrorBody["error"]> {
  return ((await res.json()) as ErrorBody).error;
}
