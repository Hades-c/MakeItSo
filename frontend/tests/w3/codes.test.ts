import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, stubAuthEnv } from "./helpers";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import VerificationCode from "@/models/VerificationCode";
import {
  CODE_RETENTION_MS,
  CODE_TTL_MS,
  consumeCode,
  deleteCodes,
  generateCode,
  hashCode,
  issueCode,
  liveCode,
  markCodeSent,
  MAX_CODE_ATTEMPTS,
} from "@/server/auth/codes";
import { CODE_FAILURES_PER_DAY, codeFailureKey } from "@/server/auth/rate-limits";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await Promise.all([VerificationCode.createIndexes(), RateLimit.createIndexes()]);
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const at = new Date("2026-09-30T16:00:00Z");
const later = (ms: number) => new Date(at.getTime() + ms);
const userId = () => new mongoose.Types.ObjectId().toString();

describe("verification codes (PLAN §6.1 W3)", () => {
  it("are 6 random digits", () => {
    const codes = new Set(Array.from({ length: 200 }, generateCode));
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(190);
  });

  it("are stored only as a keyed hash, with a 15-minute expiry, one per user and purpose", async () => {
    const id = userId();
    const code = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    const docs = await VerificationCode.find({ userId: id }).lean();
    expect(docs).toHaveLength(1);
    const doc = docs[0]!;
    expect(doc.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(doc.codeHash).not.toContain(code);
    expect(JSON.stringify(doc)).not.toContain(`"${code}"`);
    expect(doc.codeHash).toBe(hashCode(id, "verify-email", code));
    expect(doc.codeExpiresAt.getTime() - at.getTime()).toBe(CODE_TTL_MS);
    expect(CODE_TTL_MS).toBe(15 * 60 * 1000);

    // The hash is keyed with the server secret: a database dump alone cannot be brute-forced.
    vi.stubEnv("NEXTAUTH_SECRET", "another-secret-another-secret-another");
    expect(hashCode(id, "verify-email", code)).not.toBe(doc.codeHash);
  });

  it("work once", async () => {
    const id = userId();
    const code = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    expect(await consumeCode(id, "verify-email", code, later(1000))).toEqual({
      ok: true,
      email: "casey@davidson.edu",
    });
    expect(await consumeCode(id, "verify-email", code, later(2000))).toMatchObject({
      ok: false,
      reason: "missing",
    });
  });

  it("allow 5 attempts per code, then refuse even the right code (brute force)", async () => {
    const id = userId();
    const code = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    const wrong = code === "000000" ? "111111" : "000000";
    const left: number[] = [];
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      const check = await consumeCode(id, "verify-email", wrong, later(1000));
      expect(check).toMatchObject({ ok: false, reason: "mismatch" });
      if (!check.ok) left.push(check.attemptsLeft);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    expect(await consumeCode(id, "verify-email", code, later(2000))).toMatchObject({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("count parallel guesses atomically: never more than 5", async () => {
    const id = userId();
    const code = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    const wrong = code === "000000" ? "111111" : "000000";
    const results = await Promise.all(
      Array.from({ length: 12 }, () => consumeCode(id, "verify-email", wrong, later(1000))),
    );
    expect(results.filter((r) => !r.ok && r.reason === "mismatch")).toHaveLength(5);
    const doc = await VerificationCode.findOne({ userId: id }).lean();
    expect(doc?.attempts).toBe(5);
  });

  it("expire after 15 minutes", async () => {
    const id = userId();
    const code = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    expect(await consumeCode(id, "verify-email", code, later(CODE_TTL_MS + 1))).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("are replaced (and the attempts reset) by a new send", async () => {
    const id = userId();
    const first = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    const wrong = first === "000000" ? "111111" : "000000";
    await consumeCode(id, "verify-email", wrong, later(1000));
    expect((await VerificationCode.findOne({ userId: id }).lean())?.attempts).toBe(1);
    const second = await issueCode(id, "casey@davidson.edu", "verify-email", later(2000));
    expect((await VerificationCode.findOne({ userId: id }).lean())?.attempts).toBe(0);
    if (second !== first) {
      expect(await consumeCode(id, "verify-email", first, later(3000))).toMatchObject({
        ok: false,
        reason: "mismatch",
      });
    }
    expect(await consumeCode(id, "verify-email", second, later(4000))).toMatchObject({ ok: true });
    expect(await VerificationCode.countDocuments({ userId: id })).toBe(1);
  });

  it("are bound to the user and the purpose", async () => {
    const alice = userId();
    const bob = userId();
    const code = await issueCode(alice, "alice@davidson.edu", "verify-email", at);
    await issueCode(bob, "bob@davidson.edu", "verify-email", at);
    const bobsCheck = await consumeCode(bob, "verify-email", code, later(1000));
    // Bob's own code is different (or, one time in a million, identical and then correct for him only).
    if (!bobsCheck.ok) expect(bobsCheck.reason).toBe("mismatch");
    expect(await consumeCode(alice, "reset-password", code, later(1000))).toMatchObject({
      ok: false,
      reason: "missing",
    });
    expect(await consumeCode(alice, "verify-email", code, later(1000))).toMatchObject({
      ok: true,
    });
  });

  it("reject malformed input without spending more than one attempt", async () => {
    const id = userId();
    await issueCode(id, "casey@davidson.edu", "verify-email", at);
    expect(await consumeCode(id, "verify-email", "12ab56", later(1000))).toMatchObject({
      ok: false,
      reason: "mismatch",
      attemptsLeft: 4,
    });
  });

  it("keep the document 24 h, with a purge time in the real future even under a pinned clock (TTL regression)", async () => {
    const id = userId();
    await issueCode(id, "casey@davidson.edu", "verify-email", at);
    const doc = await VerificationCode.findOne({ userId: id }).lean();
    // Logical expiry on the pinned clock; the TTL field on the real one (the TTL monitor uses real time).
    expect(doc?.codeExpiresAt).toEqual(later(CODE_TTL_MS));
    expect(doc?.expiresAt.getTime()).toBeGreaterThan(Date.now() + CODE_RETENTION_MS - 60_000);
    const indexes = await VerificationCode.collection.indexes();
    expect(indexes.find((i) => i.expireAfterSeconds === 0)?.key).toEqual({ expiresAt: 1 });
  });

  it("report the live code (unused, unexpired, attempts left) and nothing else", async () => {
    const id = userId();
    expect(await liveCode(id, "verify-email", at)).toBeNull();
    const code = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    expect(await liveCode(id, "verify-email", later(1000))).toEqual({
      sentAt: at,
      expiresAt: later(CODE_TTL_MS),
    });
    expect(await liveCode(id, "reset-password", later(1000))).toBeNull();
    expect(await liveCode(id, "verify-email", later(CODE_TTL_MS))).toBeNull();
    await consumeCode(id, "verify-email", code, later(2000));
    expect(await liveCode(id, "verify-email", later(3000))).toBeNull();
    expect(await liveCode("not-an-id", "verify-email", at)).toBeNull();
  });

  it("can be deleted per user (and ignore malformed ids)", async () => {
    const id = userId();
    await issueCode(id, "casey@davidson.edu", "verify-email", at);
    await issueCode(id, "casey@davidson.edu", "reset-password", at);
    expect(await deleteCodes(id, "reset-password")).toBe(1);
    expect(await deleteCodes(id)).toBe(1);
    expect(await deleteCodes("not-an-id")).toBe(0);
  });
});

describe("the per-account wrong-code budget (review regression: slow brute force)", () => {
  const wrongFor = (code: string) => (code === "000000" ? "111111" : "000000");

  it("caps wrong codes at 10 a day per purpose, then checks none; the other purpose keeps its budget", async () => {
    const id = userId();
    let wrong = 0;
    for (let round = 0; round < 2; round++) {
      const code = await issueCode(id, "casey@davidson.edu", "reset-password", later(round));
      for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
        const check = await consumeCode(id, "reset-password", wrongFor(code), later(1000));
        if (!check.ok && check.reason === "mismatch") wrong++;
      }
    }
    expect(wrong).toBe(CODE_FAILURES_PER_DAY);
    // A fresh reset code, even the RIGHT one, is not compared any more today.
    const fresh = await issueCode(id, "casey@davidson.edu", "reset-password", later(2000));
    const locked = await consumeCode(id, "reset-password", fresh, later(3000));
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    if (!locked.ok) expect(locked.retryAfterSec).toBeGreaterThan(0);
    // Public reset guesses never lock the signed-in verification.
    const verify = await issueCode(id, "casey@davidson.edu", "verify-email", later(2000));
    expect(await consumeCode(id, "verify-email", verify, later(3000))).toMatchObject({ ok: true });
    // The next UTC day brings a new budget.
    const nextDay = new Date(Date.UTC(2026, 9, 1, 0, 0, 1));
    const again = await issueCode(id, "casey@davidson.edu", "reset-password", nextDay);
    expect(await consumeCode(id, "reset-password", again, nextDay)).toMatchObject({ ok: true });
  });

  it("gives a right code's guess back and spends nothing without a live code", async () => {
    const id = userId();
    for (let i = 0; i < 12; i++) {
      await consumeCode(id, "verify-email", "123456", later(1000)); // never sent: nothing compared
    }
    for (let round = 0; round < 12; round++) {
      const code = await issueCode(id, "casey@davidson.edu", "verify-email", later(round * 1000));
      expect(await consumeCode(id, "verify-email", code, later(round * 1000 + 1))).toMatchObject({
        ok: true,
      });
    }
    const counter = await RateLimit.collection.findOne({ key: codeFailureKey(id) });
    expect(counter?.count ?? 0).toBe(0);
  });

  it("holds under parallel guesses", async () => {
    const id = userId();
    const first = await issueCode(id, "casey@davidson.edu", "verify-email", at);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await consumeCode(id, "verify-email", wrongFor(first), later(1000));
    }
    const second = await issueCode(id, "casey@davidson.edu", "verify-email", later(1500));
    for (let i = 0; i < 2; i++) {
      await consumeCode(id, "verify-email", wrongFor(second), later(1600));
    }
    // 7 of 10 spent; 5 parallel guesses on a new code race for the last 3.
    const third = await issueCode(id, "casey@davidson.edu", "verify-email", later(2000));
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        consumeCode(id, "verify-email", wrongFor(third), later(3000)),
      ),
    );
    expect(results.filter((r) => !r.ok && r.reason === "mismatch")).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === "locked")).toHaveLength(2);
  });
});

describe("markCodeSent (start of the 24 h replacement window)", () => {
  it("records the FIRST send, and only on a pending new sign-up", async () => {
    const pending = await insertUser({ raw: { emailVerifiedAt: null } });
    const legacy = await insertUser();
    const verified = await insertUser({ raw: { emailVerifiedAt: at } });
    await markCodeSent(pending.id, at);
    await markCodeSent(pending.id, later(60_000));
    await markCodeSent(legacy.id, at);
    await markCodeSent(verified.id, at);
    await markCodeSent("not-an-id", at);
    const sentAt = async (id: string) =>
      (await User.findById(id).select("verificationSentAt").lean())?.verificationSentAt;
    expect(await sentAt(pending.id)).toEqual(at);
    expect(await sentAt(legacy.id)).toBeUndefined();
    expect(await sentAt(verified.id)).toBeUndefined();
  });
});
