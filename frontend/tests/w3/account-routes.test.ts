import mongoose from "mongoose";
import type { Session } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import {
  errorOf,
  getRequest,
  insertUser,
  jsonRequest,
  sessionFor,
  stubAuthEnv,
  storedSessionVersion,
} from "./helpers";
import { POST as changePassword } from "@/app/api/account/password/route";
import { DELETE as signOutEverywhere } from "@/app/api/account/sessions/route";
import { POST as resend } from "@/app/api/account/verify/resend/route";
import { GET as exportData } from "@/app/api/me/export/route";
import { DELETE as deleteAccount, GET as me } from "@/app/api/me/route";
import { AccountExportSchema, MeResponseSchema } from "@/lib/api/account";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import VerificationCode from "@/models/VerificationCode";
import { registerAccountData } from "@/server/account/erasers";
import { authorizeCredentials } from "@/server/auth/options";
import { loginBackoffKey, recordLoginFailure } from "@/server/auth/rate-limits";
import { getDb } from "@/server/db";

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await Promise.all([
    User.createIndexes(),
    RateLimit.createIndexes(),
    VerificationCode.createIndexes(),
  ]);
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  auth.session = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function signedIn(input: Parameters<typeof insertUser>[0] = {}) {
  const user = await insertUser({ raw: { emailVerifiedAt: null, sessionVersion: 0 }, ...input });
  auth.session = await sessionFor(user);
  return user;
}

const getMe = () => me(getRequest("/api/me"));

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

describe("GET /api/me", () => {
  it("answers who is signed in (401 otherwise), never cached", async () => {
    expect((await getMe()).status).toBe(401);
    const user = await signedIn({ name: "Casey", email: "casey@davidson.edu" });
    const res = await getMe();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = MeResponseSchema.parse(await res.json());
    expect(body.me).toEqual({
      id: user.id,
      name: "Casey",
      email: "casey@davidson.edu",
      verifiedDavidson: false,
      onboarded: false,
    });
  });
});

describe("POST /api/account/password", () => {
  const post = (body: unknown, headers?: Record<string, string>) =>
    changePassword(jsonRequest("/api/account/password", { body, headers }));

  it("needs the current password and a policy-compliant new one", async () => {
    const user = await signedIn();
    const wrong = await post({
      currentPassword: "not it at all",
      newPassword: "brand new passphrase",
    });
    expect(wrong.status).toBe(400);
    expect((await errorOf(wrong)).issues).toEqual([
      { path: "currentPassword", message: "That password is not right." },
    ]);
    const same = await post({ currentPassword: user.password, newPassword: user.password });
    expect((await errorOf(same)).issues?.[0]?.path).toBe("newPassword");
    const common = await post({ currentPassword: user.password, newPassword: "1234567890" });
    expect((await errorOf(common)).issues?.[0]?.message).toMatch(/commonly used/);
    expect((await post({ currentPassword: user.password, newPassword: "short" })).status).toBe(400);
    expect(await storedSessionVersion(user.id)).toBe(0);
  });

  it("changes the password and signs every session out (sessionVersion)", async () => {
    const user = await signedIn();
    const res = await post({ currentPassword: user.password, newPassword: "brand new passphrase" });
    expect(res.status).toBe(204);
    expect(await storedSessionVersion(user.id)).toBe(1);
    // The session that made the change is revoked too (the form signs in again).
    expect((await getMe()).status).toBe(401);
    expect(await authorizeCredentials({ email: user.email, password: user.password })).toBeNull();
    expect(
      await authorizeCredentials({ email: user.email, password: "brand new passphrase" }),
    ).toMatchObject({ sessionVersion: 1 });
  });

  it("is signed-in, same-origin and rate-limited (10 per hour)", async () => {
    expect((await post({ currentPassword: "x", newPassword: "brand new passphrase" })).status).toBe(
      401,
    );
    const user = await signedIn();
    expect(
      (
        await post(
          { currentPassword: user.password, newPassword: "brand new passphrase" },
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    for (let i = 0; i < 10; i++) {
      await post({ currentPassword: "wrong wrong", newPassword: "brand new passphrase" });
    }
    expect(
      (await post({ currentPassword: user.password, newPassword: "brand new passphrase" })).status,
    ).toBe(429);
  });
});

describe("DELETE /api/account/sessions (sign out everywhere)", () => {
  it("revokes every session and clears this browser's cookie", async () => {
    const user = await signedIn();
    const otherDevice = auth.session;
    const res = await signOutEverywhere(jsonRequest("/api/account/sessions", { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const cookies = setCookies(res);
    expect(cookies.some((c) => /^next-auth\.session-token=;/.test(c) && /Max-Age=0/i.test(c))).toBe(
      true,
    );
    expect(
      cookies.some((c) => c.startsWith("__Secure-next-auth.session-token=") && /Secure/.test(c)),
    ).toBe(true);
    expect(await storedSessionVersion(user.id)).toBe(1);

    auth.session = otherDevice;
    expect((await getMe()).status).toBe(401);
    auth.session = await sessionFor({ ...user, sessionVersion: 1 });
    expect((await getMe()).status).toBe(200);
  });
});

describe("GET /api/me/export", () => {
  it("downloads the account (no password hash) and every registered collection", async () => {
    const user = await signedIn({ email: "casey@davidson.edu" });
    const userId = new mongoose.Types.ObjectId(user.id);
    await resend(jsonRequest("/api/account/verify/resend"));
    await CoursePlanV1.collection.insertOne({
      userId,
      plannedCourses: [{ courseCode: "CSC 121" }],
    });

    const res = await exportData(getRequest("/api/me/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="makeitso-data-2026-09-30.json"',
    );
    const text = await res.clone().text();
    const body = AccountExportSchema.parse(await res.json());
    expect(body.exportedAt).toBe("2026-09-30T16:00:00.000Z");
    expect(body.profile).toMatchObject({
      _id: user.id,
      email: "casey@davidson.edu",
      name: user.name,
    });
    expect(body.profile).not.toHaveProperty("password");
    expect(text).not.toMatch(/\$2[aby]\$/);
    expect(Object.keys(body.data)).toEqual(
      expect.arrayContaining(["courseplans-legacy", "ratelimits", "verificationcodes"]),
    );
    expect(body.data["courseplans-legacy"]).toHaveLength(1);
    const codes = body.data.verificationcodes as Record<string, unknown>[];
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatchObject({ purpose: "verify-email", email: "casey@davidson.edu" });
    expect(codes[0]).not.toHaveProperty("codeHash");
    const keys = (body.data.ratelimits as { key: string }[]).map((r) => r.key).sort();
    expect(keys).toEqual([`export:user:${user.id}`, `verify-resend:user:${user.id}`]);
  });

  it("is limited to 5 exports a day", async () => {
    await signedIn();
    for (let i = 0; i < 5; i++)
      expect((await exportData(getRequest("/api/me/export"))).status).toBe(200);
    const sixth = await exportData(getRequest("/api/me/export"));
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("needs a session", async () => {
    expect((await exportData(getRequest("/api/me/export"))).status).toBe(401);
  });
});

describe("DELETE /api/me (delete account)", () => {
  const del = (body: unknown, headers?: Record<string, string>) =>
    deleteAccount(jsonRequest("/api/me", { method: "DELETE", body, headers }));

  it("needs the password", async () => {
    const user = await signedIn();
    const res = await del({ password: "not the password" });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).issues).toEqual([
      { path: "password", message: "That password is not right." },
    ]);
    expect(await User.countDocuments({ _id: user.id })).toBe(1);
    expect((await del({})).status).toBe(400);
    expect((await del({ password: user.password, extra: true })).status).toBe(400);
    expect(
      (await del({ password: user.password }, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(await User.countDocuments({ _id: user.id })).toBe(1);
  });

  it("erases everything registered for the account, then the account, and signs out (cascade)", async () => {
    const other = await insertUser({ email: "other@davidson.edu" });
    const otherId = new mongoose.Types.ObjectId(other.id);
    await CoursePlanV1.collection.insertOne({ userId: otherId, plannedCourses: [] });
    await RateLimit.collection.insertOne({
      key: `export:user:${other.id}`,
      windowStart: new Date(0),
      count: 1,
      expiresAt: new Date("2030-01-01"),
    });

    const user = await signedIn({ email: "casey@davidson.edu" });
    const userId = new mongoose.Types.ObjectId(user.id);
    await resend(jsonRequest("/api/account/verify/resend"));
    await exportData(getRequest("/api/me/export"));
    await recordLoginFailure("casey@davidson.edu", new Date("2026-09-30T16:00:00Z"));
    await CoursePlanV1.collection.insertOne({ userId, plannedCourses: [] });
    await RateLimit.collection.insertOne({
      key: "login:ip:203.0.113.7",
      windowStart: new Date(0),
      count: 1,
      expiresAt: new Date("2030-01-01"),
    });
    const session = auth.session;

    const res = await del({ password: user.password });
    expect(res.status).toBe(204);
    expect(setCookies(res).some((c) => /^next-auth\.session-token=;.*Max-Age=0/i.test(c))).toBe(
      true,
    );

    expect(await User.countDocuments({ _id: userId })).toBe(0);
    expect(await VerificationCode.countDocuments({ userId })).toBe(0);
    expect(await CoursePlanV1.collection.countDocuments({ userId })).toBe(0);
    const remaining = (await RateLimit.collection.find({}).toArray()).map((r) => r.key).sort();
    // Only the other account's counter and the IP counter are left.
    expect(remaining).toEqual([`export:user:${other.id}`, "login:ip:203.0.113.7"]);
    expect(remaining).not.toContain(loginBackoffKey("casey@davidson.edu"));

    expect(await User.countDocuments({ _id: otherId })).toBe(1);
    expect(await CoursePlanV1.collection.countDocuments({ userId: otherId })).toBe(1);

    auth.session = session;
    expect((await getMe()).status).toBe(401);
    expect(await authorizeCredentials({ email: user.email, password: user.password })).toBeNull();
  });

  it("keeps the account (so it can be retried) when an eraser fails", async () => {
    const user = await signedIn();
    registerAccountData("zz-broken", {
      export: async () => null,
      erase: async () => {
        throw new Error("collection offline");
      },
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await del({ password: user.password });
      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalled();
      expect(await User.countDocuments({ _id: user.id })).toBe(1);
    } finally {
      registerAccountData("zz-broken", { export: async () => null, erase: async () => 0 });
    }
  });
});
