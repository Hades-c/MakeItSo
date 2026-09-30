import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import RateLimit from "@/models/RateLimit";
import {
  backoffDelayMs,
  clearLoginFailures,
  consumeLoginIpLimit,
  consumeMailAllowance,
  describeWait,
  emailKey,
  LOGIN_STREAK_MS,
  loginBackoffKey,
  loginBackoffStatus,
  recordLoginFailure,
} from "@/server/auth/rate-limits";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await RateLimit.createIndexes();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const at = new Date("2026-09-30T16:00:00Z");
const plus = (ms: number) => new Date(at.getTime() + ms);

describe("sign-in backoff (per address, no hard lockout)", () => {
  it("waits 30 s after 5 failures, doubling to a 15-minute cap", () => {
    expect([0, 1, 4].map(backoffDelayMs)).toEqual([0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10, 11, 50].map(backoffDelayMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000, 900_000,
    ]);
  });

  it("blocks attempts during the wait, then lets the next one through", async () => {
    const email = "casey@davidson.edu";
    for (let i = 0; i < 4; i++) await recordLoginFailure(email, at);
    expect(await loginBackoffStatus(email, at)).toMatchObject({ failures: 4, blocked: false });
    await recordLoginFailure(email, at);
    expect(await loginBackoffStatus(email, plus(1000))).toEqual({
      failures: 5,
      blocked: true,
      retryAfterSec: 29,
    });
    expect(await loginBackoffStatus(email, plus(30_001))).toMatchObject({ blocked: false });

    await recordLoginFailure(email, plus(31_000));
    const sixth = await loginBackoffStatus(email, plus(31_000));
    expect(sixth).toMatchObject({ failures: 6, blocked: true, retryAfterSec: 60 });
  });

  it("keys by the normalised address (case, spaces, NFKC) through a hash", async () => {
    await recordLoginFailure("  Casey@Davidson.EDU ", at);
    const docs = await RateLimit.collection.find({}).toArray();
    expect(docs.map((d) => d.key)).toEqual([loginBackoffKey("casey@davidson.edu")]);
    expect(docs[0]?.key).toMatch(/^login-backoff:email:[a-f0-9]{32}$/);
    expect(JSON.stringify(docs)).not.toContain("casey");
    expect(emailKey("ｃasey@davidson.edu")).toBe(emailKey("casey@davidson.edu"));
  });

  it("ends the streak on success, or 24 h after the last failure", async () => {
    const email = "casey@davidson.edu";
    for (let i = 0; i < 6; i++) await recordLoginFailure(email, at);
    await clearLoginFailures(email);
    expect(await loginBackoffStatus(email, at)).toMatchObject({ failures: 0, blocked: false });

    for (let i = 0; i < 6; i++) await recordLoginFailure(email, at);
    const dayLater = plus(LOGIN_STREAK_MS + 1);
    expect(await loginBackoffStatus(email, dayLater)).toMatchObject({ failures: 0 });
    // The expired streak document may still exist (TTL monitor lag): the next failure restarts at 1.
    await recordLoginFailure(email, dayLater);
    expect(await loginBackoffStatus(email, dayLater)).toMatchObject({ failures: 1 });
  });

  it("counts parallel failures atomically", async () => {
    await Promise.all(Array.from({ length: 8 }, () => recordLoginFailure("race@davidson.edu", at)));
    expect(await loginBackoffStatus("race@davidson.edu", at)).toMatchObject({ failures: 8 });
  });

  it("is skipped with RATE_LIMITS=off (fixtures-mode test knob)", async () => {
    vi.stubEnv("RATE_LIMITS", "off");
    for (let i = 0; i < 8; i++) await recordLoginFailure("casey@davidson.edu", at);
    expect(await loginBackoffStatus("casey@davidson.edu", at)).toMatchObject({ blocked: false });
    expect(await RateLimit.countDocuments()).toBe(0);
  });
});

describe("other auth limits", () => {
  it("allows 10 sign-in attempts per 15 minutes per IP", async () => {
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await consumeLoginIpLimit("203.0.113.7", at));
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10]).toMatchObject({ allowed: false });
    expect((await consumeLoginIpLimit("198.51.100.1", at)).allowed).toBe(true);
    expect((await RateLimit.collection.findOne({ key: "login:ip:203.0.113.7" }))?.count).toBe(11);
  });

  it("allows 3 e-mails per hour per address and kind", async () => {
    const allowed = [];
    for (let i = 0; i < 4; i++) {
      allowed.push(await consumeMailAllowance("register-mail", "casey@davidson.edu", at));
    }
    expect(allowed).toEqual([true, true, true, false]);
    expect(await consumeMailAllowance("reset-mail", "casey@davidson.edu", at)).toBe(true);
  });

  it("describes waits for messages", () => {
    expect(describeWait(1)).toBe("1 second");
    expect(describeWait(29)).toBe("29 seconds");
    expect(describeWait(60)).toBe("1 minute");
    expect(describeWait(61)).toBe("2 minutes");
  });
});
