import mongoose from "mongoose";
import type { Session } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, sessionFor, stubAuthEnv } from "./helpers";
import User from "@/models/User";
import {
  getSessionUser,
  isEmailVerified,
  isVerifiedDavidsonUser,
  requireApiUser,
  requireUser,
  resolveSessionUser,
  VERIFIED_ONLY_REDIRECT,
} from "@/server/auth/session";
import { getDb } from "@/server/db";

const auth = vi.hoisted(() => ({ session: null as Session | null }));

vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
// connection() needs a Next.js request scope; the tests call pages' helpers directly.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  auth.session = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

/** The path a Next.js redirect() inside `run` goes to. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    return digest.split(";")[2] ?? null;
  }
}

describe("sessions with sessionVersion (PLAN §6.1 W3)", () => {
  it("resolves the signed-in account from the database", async () => {
    const user = await insertUser({ name: "Casey", raw: { emailVerifiedAt: null } });
    const signedIn = await resolveSessionUser(await sessionFor(user));
    expect(signedIn).toEqual({
      id: user.id,
      email: user.email,
      name: "Casey",
      emailVerifiedAt: null,
    });
  });

  it("uses the stored name and email, not the token's", async () => {
    const user = await insertUser({ name: "Casey" });
    const session = await sessionFor(user);
    await User.updateOne({ _id: user.id }, { $set: { name: "Casey Renamed" } });
    expect((await resolveSessionUser(session))?.name).toBe("Casey Renamed");
  });

  it("revokes every session issued before a sessionVersion bump", async () => {
    const user = await insertUser();
    const session = await sessionFor(user);
    expect(await resolveSessionUser(session)).not.toBeNull();
    await User.updateOne({ _id: user.id }, { $inc: { sessionVersion: 1 } });
    expect(await resolveSessionUser(session)).toBeNull();
    // A session from after the bump works.
    expect(
      await resolveSessionUser(await sessionFor({ ...user, sessionVersion: 1 })),
    ).not.toBeNull();
  });

  it("keeps pre-upgrade sessions of never-bumped accounts (both versions count as 0)", async () => {
    const user = await insertUser();
    const legacySession: Session = {
      user: { id: user.id, email: user.email, name: user.name },
      expires: "2026-10-14T00:00:00.000Z",
    };
    expect(await resolveSessionUser(legacySession)).toMatchObject({ id: user.id });
  });

  it("signs out deleted accounts and junk sessions", async () => {
    const user = await insertUser();
    const session = await sessionFor(user);
    await User.deleteOne({ _id: user.id });
    expect(await resolveSessionUser(session)).toBeNull();
    expect(await resolveSessionUser(null)).toBeNull();
    expect(
      await resolveSessionUser({ user: { id: "not-an-id" }, expires: "" } as Session),
    ).toBeNull();
    expect(
      await resolveSessionUser({
        user: { id: new mongoose.Types.ObjectId().toString() },
        expires: "",
      } as Session),
    ).toBeNull();
  });

  it("getSessionUser / requireApiUser read the NextAuth session", async () => {
    await expect(requireApiUser()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    const user = await insertUser();
    auth.session = await sessionFor(user);
    expect(await getSessionUser()).toMatchObject({ id: user.id });
    expect(await requireApiUser()).toMatchObject({ id: user.id });
  });
});

describe("requireUser", () => {
  it("redirects signed-out visitors to /login", async () => {
    expect(await redirectOf(() => requireUser())).toBe("/login");
  });

  it("with verifiedDavidson, sends unverified and non-Davidson accounts to /verify?reason=davidson", async () => {
    expect(VERIFIED_ONLY_REDIRECT).toBe("/verify?reason=davidson");
    const unverified = await insertUser({
      email: "new@davidson.edu",
      raw: { emailVerifiedAt: null },
    });
    auth.session = await sessionFor(unverified);
    expect(await requireUser()).toMatchObject({ id: unverified.id });
    expect(await redirectOf(() => requireUser({ verifiedDavidson: true }))).toBe(
      VERIFIED_ONLY_REDIRECT,
    );

    const gmail = await insertUser({
      email: "owner@gmail.com",
      raw: { emailVerifiedAt: new Date() },
    });
    auth.session = await sessionFor(gmail);
    expect(await redirectOf(() => requireUser({ verifiedDavidson: true }))).toBe(
      VERIFIED_ONLY_REDIRECT,
    );

    const verified = await insertUser({
      email: "verified@davidson.edu",
      raw: { emailVerifiedAt: new Date() },
    });
    auth.session = await sessionFor(verified);
    expect(await requireUser({ verifiedDavidson: true })).toMatchObject({ id: verified.id });
  });
});

describe("verification helpers", () => {
  it("isEmailVerified / isVerifiedDavidsonUser", () => {
    expect(isEmailVerified({ emailVerifiedAt: new Date() })).toBe(true);
    expect(isEmailVerified({ emailVerifiedAt: "2026-09-30T16:00:00.000Z" })).toBe(true);
    expect(isEmailVerified({ emailVerifiedAt: null })).toBe(false);
    expect(isEmailVerified({})).toBe(false);
    expect(isEmailVerified({ emailVerifiedAt: new Date("nope") })).toBe(false);
    expect(isEmailVerified(null)).toBe(false);
    const at = new Date();
    expect(isVerifiedDavidsonUser({ email: "a@davidson.edu", emailVerifiedAt: at })).toBe(true);
    expect(isVerifiedDavidsonUser({ email: "a@gmail.com", emailVerifiedAt: at })).toBe(false);
    expect(isVerifiedDavidsonUser({ email: "a@davidson.edu" })).toBe(false);
  });
});
