import mongoose from "mongoose";
import type { Session } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { errorOf, FIXTURE_NOW, insertUser, jsonRequest, stubAuthEnv } from "./helpers";
import { POST as register } from "@/app/api/auth/register/route";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import VerificationCode from "@/models/VerificationCode";
import { authorizeCredentials } from "@/server/auth/options";
import { clearConsoleOutbox, consoleOutbox, lastConsoleMessage } from "@/server/auth/mailer";
import {
  CHECK_INBOX_MESSAGE,
  NO_MAIL_MESSAGE,
  REPLACE_UNVERIFIED_AFTER_MS,
} from "@/server/auth/registration";
import { verifyEmailCode } from "@/server/auth/verification";
import { getDb } from "@/server/db";

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
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

beforeEach(() => {
  stubAuthEnv();
  clearConsoleOutbox();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const casey = {
  name: "Casey Wildcat",
  email: "Casey.Wildcat@Davidson.edu",
  password: "correct horse battery",
};
const CASEY = "casey.wildcat@davidson.edu";

function post(body: unknown, headers: Record<string, string> = {}) {
  return register(jsonRequest("/api/auth/register", { body, headers }));
}

async function answer(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as unknown,
    cache: res.headers.get("cache-control"),
  };
}

const CHECK_INBOX = {
  status: 202,
  body: { status: "check-inbox", message: CHECK_INBOX_MESSAGE },
  cache: "private, no-store",
};

describe("POST /api/auth/register (PLAN §1 Sign-up)", () => {
  it("creates an unverified account and e-mails a verification code", async () => {
    expect(await answer(await post({ ...casey, graduationYear: 2029 }))).toEqual(CHECK_INBOX);

    const stored = await User.collection.findOne({ email: CASEY });
    expect(stored).toMatchObject({
      name: "Casey Wildcat",
      emailVerifiedAt: null,
      sessionVersion: 0,
      graduationYear: 2029,
      major: "Undecided",
    });
    // emailVerifiedAt is stored explicitly as null (a new sign-up), not left out (a legacy account).
    expect(stored && "emailVerifiedAt" in stored).toBe(true);
    expect(stored?.password).toMatch(/^\$2[aby]\$12\$/);

    const mail = lastConsoleMessage(CASEY);
    expect(mail).toMatchObject({ kind: "verify-email" });
    expect(mail?.code).toMatch(/^\d{6}$/);
    expect(await VerificationCode.countDocuments({ userId: stored?._id })).toBe(1);
    // The first code counts against the 3-per-hour send limit.
    expect(
      await RateLimit.collection.findOne({ key: `verify-resend:user:${stored?._id.toString()}` }),
    ).toMatchObject({ count: 1 });

    // New code never writes the legacy collection (PLAN §4).
    expect(await CoursePlanV1.countDocuments()).toBe(0);
    // The account can sign in straight away (catalog and plan work unverified).
    expect(await authorizeCredentials({ email: CASEY, password: casey.password })).toMatchObject({
      email: CASEY,
    });
  });

  it("defaults the graduation year to this year's first-year class", async () => {
    await post(casey);
    expect((await User.findOne({ email: CASEY }).lean())?.graduationYear).toBe(2030);
  });

  it("normalises the address: NFKC, trim, lower case", async () => {
    await post({ ...casey, email: "  ＣＡＳＥＹ.wildcat@DAVIDSON.edu " });
    expect(await User.countDocuments({ email: CASEY })).toBe(1);
  });

  it("answers exactly the same for a verified account, and only e-mails its owner a sign-in reminder", async () => {
    const owner = await insertUser({
      email: CASEY,
      raw: { emailVerifiedAt: new Date(FIXTURE_NOW), sessionVersion: 0 },
    });
    const before = await User.collection.findOne({ email: CASEY });
    expect(await answer(await post({ ...casey, password: "someone else entirely" }))).toEqual(
      CHECK_INBOX,
    );
    expect(await User.collection.findOne({ email: CASEY })).toEqual(before);
    expect(consoleOutbox().map((m) => m.kind)).toEqual(["already-registered"]);
    expect(lastConsoleMessage(CASEY)?.code).toBeUndefined();
    expect(await authorizeCredentials({ email: CASEY, password: owner.password })).not.toBeNull();
  });

  it("answers the same for a legacy account (no emailVerifiedAt) and never replaces it", async () => {
    await insertUser({
      email: CASEY,
      raw: { createdAt: new Date("2026-03-01T00:00:00Z"), major: "History" },
    });
    expect(await answer(await post(casey))).toEqual(CHECK_INBOX);
    expect(await User.collection.findOne({ email: CASEY })).toMatchObject({ major: "History" });
    expect(lastConsoleMessage(CASEY)?.kind).toBe("already-registered");
  });

  it("keeps a fresh unverified sign-up (< 24 h) and tells the inbox how to take it over", async () => {
    const pending = await insertUser({ email: CASEY, raw: { emailVerifiedAt: null } });
    expect(await answer(await post({ ...casey, password: "the real owner's pw" }))).toEqual(
      CHECK_INBOX,
    );
    expect((await User.collection.findOne({ email: CASEY }))?._id.toString()).toBe(pending.id);
    expect(lastConsoleMessage(CASEY)).toMatchObject({ kind: "signup-pending" });
  });

  it("replaces an unverified sign-up older than 24 h, erasing its data (squat replacement)", async () => {
    const created = new Date(new Date(FIXTURE_NOW).getTime() - REPLACE_UNVERIFIED_AFTER_MS - 1000);
    const squat = await insertUser({
      email: CASEY,
      password: "squatter password",
      raw: { emailVerifiedAt: null, createdAt: created },
    });
    const squatId = new mongoose.Types.ObjectId(squat.id);
    await VerificationCode.collection.insertOne({
      userId: squatId,
      purpose: "verify-email",
      email: CASEY,
      codeHash: "x".repeat(64),
      attempts: 0,
      lastSentAt: created,
      expiresAt: new Date(created.getTime() + 900_000),
    });
    await CoursePlanV1.collection.insertOne({ userId: squatId, plannedCourses: [] });

    expect(await answer(await post(casey))).toEqual(CHECK_INBOX);

    const now = await User.collection.findOne({ email: CASEY });
    expect(now?._id.toString()).not.toBe(squat.id);
    expect(now?.name).toBe("Casey Wildcat");
    expect(await VerificationCode.countDocuments({ userId: squatId })).toBe(0);
    expect(await CoursePlanV1.collection.countDocuments({ userId: squatId })).toBe(0);
    expect(await authorizeCredentials({ email: CASEY, password: "squatter password" })).toBeNull();
    expect(await authorizeCredentials({ email: CASEY, password: casey.password })).not.toBeNull();
    expect(lastConsoleMessage(CASEY)?.kind).toBe("verify-email");

    // First to verify wins: the replaced sign-up can no longer be verified.
    await expect(verifyEmailCode(squat.id, "123456")).rejects.toMatchObject({ status: 401 });
  });

  it("does not replace an old sign-up that was verified first, nor one flagged legacy", async () => {
    const old = new Date(new Date(FIXTURE_NOW).getTime() - 2 * REPLACE_UNVERIFIED_AFTER_MS);
    await insertUser({ email: CASEY, raw: { emailVerifiedAt: old, createdAt: old } });
    await post(casey);
    expect(await User.countDocuments({ email: CASEY })).toBe(1);
    expect(lastConsoleMessage(CASEY)?.kind).toBe("already-registered");

    await insertUser({
      email: "flagged@davidson.edu",
      raw: { emailVerifiedAt: null, legacyAccount: true, createdAt: old },
    });
    const flaggedBefore = await User.collection.findOne({ email: "flagged@davidson.edu" });
    await post({ ...casey, email: "flagged@davidson.edu" });
    expect((await User.collection.findOne({ email: "flagged@davidson.edu" }))?._id).toEqual(
      flaggedBefore?._id,
    );
  });

  it("never replaces anything while mail is unavailable (nobody could verify)", async () => {
    vi.stubEnv("MAIL_PROVIDER", "none");
    const old = new Date(new Date(FIXTURE_NOW).getTime() - 2 * REPLACE_UNVERIFIED_AFTER_MS);
    const squat = await insertUser({
      email: CASEY,
      raw: { emailVerifiedAt: null, createdAt: old },
    });
    const res = await post(casey);
    expect(await answer(res)).toEqual({
      status: 202,
      body: { status: "check-inbox", message: NO_MAIL_MESSAGE },
      cache: "private, no-store",
    });
    expect((await User.collection.findOne({ email: CASEY }))?._id.toString()).toBe(squat.id);
    expect(consoleOutbox()).toHaveLength(0);

    // A new address still gets an account (unverified), with the same answer.
    const fresh = await post({ ...casey, email: "fresh@davidson.edu" });
    expect((await answer(fresh)).body).toEqual({ status: "check-inbox", message: NO_MAIL_MESSAGE });
    expect(await User.countDocuments({ email: "fresh@davidson.edu" })).toBe(1);
  });

  it("creates one account when two registrations of a new address race", async () => {
    const [a, b] = await Promise.all([
      post(casey),
      post({ ...casey, password: "another long pw" }),
    ]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(await User.countDocuments({ email: CASEY })).toBe(1);
  });

  it("sends at most 3 e-mails an hour to an existing address", async () => {
    await insertUser({ email: CASEY, raw: { emailVerifiedAt: new Date(FIXTURE_NOW) } });
    for (let i = 0; i < 5; i++) expect((await post(casey)).status).toBe(202);
    expect(consoleOutbox().filter((m) => m.to === CASEY)).toHaveLength(3);
  });
});

describe("POST /api/auth/register validation", () => {
  it("accepts only @davidson.edu addresses", async () => {
    for (const email of [
      "casey@gmail.com",
      "casey@davidson.edu.evil.com",
      "casey@alumni.davidson.edu",
      "not an email",
    ]) {
      await RateLimit.deleteMany({});
      const res = await post({ ...casey, email });
      expect(res.status).toBe(400);
      expect((await errorOf(res)).issues?.map((i) => i.path)).toEqual(["email"]);
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it("enforces the password policy: 10–72 bytes, not blank, not common, not the address", async () => {
    const cases: [string, RegExp][] = [
      ["short", /at least 10/],
      ["é".repeat(37), /72 bytes/],
      [" ".repeat(12), /only spaces/],
      ["1234567890", /commonly used/],
      ["Basketball", /commonly used/],
      ["casey.wildcat", /email address/],
    ];
    for (const [password, message] of cases) {
      // The 5-per-hour limit counts every request, invalid ones too: start each case afresh.
      await RateLimit.deleteMany({});
      const res = await post({ ...casey, password });
      expect(res.status).toBe(400);
      const error = await errorOf(res);
      expect(error.code).toBe("validation_failed");
      expect(error.issues?.find((i) => i.path === "password")?.message).toMatch(message);
    }
    expect(await User.countDocuments()).toBe(0);
    expect(consoleOutbox()).toHaveLength(0);
  });

  it("rejects unknown fields, prototype keys and operators (strict body)", async () => {
    for (const body of [
      { ...casey, emailVerifiedAt: new Date().toISOString() },
      { ...casey, major: "Biology" },
      JSON.parse(
        `{"name":"x","email":"x@davidson.edu","password":"a long password","__proto__":{"admin":true}}`,
      ),
      { ...casey, $set: { emailVerifiedAt: 1 } },
      { ...casey, email: { $gt: "" } },
    ]) {
      await RateLimit.deleteMany({});
      expect((await post(body)).status).toBe(400);
    }
    expect(await User.countDocuments()).toBe(0);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("refuses cross-site, origin-less and non-JSON requests before doing anything", async () => {
    expect((await post(casey, { origin: "https://evil.example" })).status).toBe(403);
    const noOrigin = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(casey),
    });
    expect((await register(noOrigin)).status).toBe(403);
    expect((await post("name=x", { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  it("allows 5 registrations per hour per client IP", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post({ ...casey, email: `r${i}@davidson.edu` })).status).toBe(202);
    }
    const sixth = await post({ ...casey, email: "r5@davidson.edu" });
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await errorOf(sixth)).code).toBe("rate_limited");
    expect(await User.countDocuments({ email: "r5@davidson.edu" })).toBe(0);
  });
});
