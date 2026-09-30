import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { stubAuthEnv } from "./helpers";
import VerificationCode from "@/models/VerificationCode";
import {
  CODE_TTL_MS,
  consumeCode,
  deleteCodes,
  generateCode,
  hashCode,
  issueCode,
  MAX_CODE_ATTEMPTS,
} from "@/server/auth/codes";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await VerificationCode.createIndexes();
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
    expect(doc.expiresAt.getTime() - at.getTime()).toBe(CODE_TTL_MS);
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

  it("can be deleted per user (and ignore malformed ids)", async () => {
    const id = userId();
    await issueCode(id, "casey@davidson.edu", "verify-email", at);
    await issueCode(id, "casey@davidson.edu", "reset-password", at);
    expect(await deleteCodes(id, "reset-password")).toBe(1);
    expect(await deleteCodes(id)).toBe(1);
    expect(await deleteCodes("not-an-id")).toBe(0);
  });
});
