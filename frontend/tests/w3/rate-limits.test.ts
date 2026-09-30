import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import RateLimit from "@/models/RateLimit";
import {
  addressCeilingDelayMs,
  backoffDelayMs,
  clearLoginFailures,
  CODE_FAILURES_PER_DAY,
  codeFailureKey,
  codeGuessesExhausted,
  consumeAuthLimit,
  consumeLoginIpLimit,
  consumeMailAllowance,
  describeWait,
  emailKey,
  fixedWindowStart,
  knownSignInKey,
  LOGIN_ADDRESS_CEILING,
  LOGIN_STREAK_MS,
  loginBackoffKey,
  loginBackoffStatus,
  purgeTime,
  recordLoginFailure,
  recordLoginSuccess,
  releaseCodeGuess,
  releaseLoginIpLimit,
  reserveCodeGuess,
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

/** The pinned fixtures day (in the real past): what server "now" returns in tests. */
const at = new Date("2026-09-30T16:00:00Z");
const plus = (ms: number) => new Date(at.getTime() + ms);
const IP = "203.0.113.7";
const OTHER_IP = "198.51.100.1";

describe("sign-in backoff (per address and client IP, no hard lockout)", () => {
  it("waits 30 s after 5 failures from one IP, doubling to a 15-minute cap", () => {
    expect([0, 1, 4].map(backoffDelayMs)).toEqual([0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10, 11, 50].map(backoffDelayMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000, 900_000,
    ]);
    expect([0, 99].map(addressCeilingDelayMs)).toEqual([0, 0]);
    expect([100, 500].map(addressCeilingDelayMs)).toEqual([60_000, 60_000]);
  });

  it("blocks attempts during the wait, then lets the next one through", async () => {
    const email = "casey@davidson.edu";
    for (let i = 0; i < 4; i++) await recordLoginFailure(email, IP, at);
    expect(await loginBackoffStatus(email, IP, at)).toMatchObject({ failures: 4, blocked: false });
    await recordLoginFailure(email, IP, at);
    expect(await loginBackoffStatus(email, IP, plus(1000))).toEqual({
      failures: 5,
      addressFailures: 5,
      blocked: true,
      retryAfterSec: 29,
    });
    expect(await loginBackoffStatus(email, IP, plus(30_001))).toMatchObject({ blocked: false });

    await recordLoginFailure(email, IP, plus(31_000));
    const sixth = await loginBackoffStatus(email, IP, plus(31_000));
    expect(sixth).toMatchObject({ failures: 6, blocked: true, retryAfterSec: 60 });
  });

  it("backs off the guessing IP only: the student signs in from another IP (review regression)", async () => {
    const email = "casey@davidson.edu";
    // An attacker timing one failure to the end of every block, around the clock (the reviewer's PoC).
    let t = 0;
    for (let i = 0; i < 99; i++) {
      await recordLoginFailure(email, IP, plus(t));
      t += backoffDelayMs(i + 1) + 1000;
    }
    expect(await loginBackoffStatus(email, IP, plus(t - 2000))).toMatchObject({ blocked: true });
    expect(await loginBackoffStatus(email, OTHER_IP, plus(t - 2000))).toMatchObject({
      failures: 0,
      addressFailures: 99,
      blocked: false,
    });
  });

  it("past 100 failures for an address, paces new IPs to one attempt a minute; IPs that signed in before are exempt", async () => {
    const email = "casey@davidson.edu";
    await recordLoginSuccess(email, OTHER_IP, plus(-86_400_000));
    // Distributed guessing: 100 failures from 100 IPs, 5 seconds apart.
    for (let i = 0; i < LOGIN_ADDRESS_CEILING; i++) {
      await recordLoginFailure(email, `192.0.2.${i}`, plus(i * 5000));
    }
    const last = plus((LOGIN_ADDRESS_CEILING - 1) * 5000);
    const fresh = await loginBackoffStatus(email, "233.252.0.1", new Date(last.getTime() + 1000));
    expect(fresh).toMatchObject({ failures: 0, addressFailures: 100, blocked: true });
    expect(fresh.retryAfterSec).toBe(59);
    expect(
      await loginBackoffStatus(email, "233.252.0.1", new Date(last.getTime() + 60_001)),
    ).toMatchObject({ blocked: false });
    // The student's usual IP (signed in successfully within 30 days) is never paced by the ceiling.
    expect(
      await loginBackoffStatus(email, OTHER_IP, new Date(last.getTime() + 1000)),
    ).toMatchObject({ blocked: false });
  });

  it("keys by the normalised address and a hash of the IP (no address or IP stored)", async () => {
    await recordLoginFailure("  Casey@Davidson.EDU ", IP, at);
    const keys = (await RateLimit.collection.find({}).toArray()).map((d) => d.key).sort();
    expect(keys).toEqual(
      [loginBackoffKey("casey@davidson.edu"), loginBackoffKey("casey@davidson.edu", IP)].sort(),
    );
    expect(keys[0]).toMatch(/^login-backoff:email:[a-f0-9]{32}(:ip:[a-f0-9]{16})?$/);
    const stored = JSON.stringify(await RateLimit.collection.find({}).toArray());
    expect(stored).not.toContain("casey");
    expect(stored).not.toContain(IP);
    expect(emailKey("ｃasey@davidson.edu")).toBe(emailKey("casey@davidson.edu"));
  });

  it("a success ends that IP's streak (the address-wide one stays); a reset ends all; 24 h ends them too", async () => {
    const email = "casey@davidson.edu";
    for (let i = 0; i < 6; i++) await recordLoginFailure(email, IP, at);
    await recordLoginSuccess(email, IP, at);
    expect(await loginBackoffStatus(email, IP, at)).toMatchObject({
      failures: 0,
      addressFailures: 6,
      blocked: false,
    });
    expect(await RateLimit.collection.countDocuments({ key: knownSignInKey(email, IP) })).toBe(1);

    for (let i = 0; i < 6; i++) await recordLoginFailure(email, OTHER_IP, at);
    await clearLoginFailures(email);
    expect(await loginBackoffStatus(email, OTHER_IP, at)).toMatchObject({
      failures: 0,
      addressFailures: 0,
    });

    for (let i = 0; i < 6; i++) await recordLoginFailure(email, IP, at);
    const dayLater = plus(LOGIN_STREAK_MS + 1);
    expect(await loginBackoffStatus(email, IP, dayLater)).toMatchObject({ failures: 0 });
    // The expired streak document may still exist (TTL monitor lag): the next failure restarts at 1.
    await recordLoginFailure(email, IP, dayLater);
    expect(await loginBackoffStatus(email, IP, dayLater)).toMatchObject({
      failures: 1,
      addressFailures: 1,
    });
  });

  it("counts parallel failures atomically", async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => recordLoginFailure("race@davidson.edu", IP, at)),
    );
    expect(await loginBackoffStatus("race@davidson.edu", IP, at)).toMatchObject({
      failures: 8,
      addressFailures: 8,
    });
  });

  it("is skipped with RATE_LIMITS=off (fixtures-mode test knob)", async () => {
    vi.stubEnv("RATE_LIMITS", "off");
    for (let i = 0; i < 8; i++) await recordLoginFailure("casey@davidson.edu", IP, at);
    await recordLoginSuccess("casey@davidson.edu", IP, at);
    expect(await loginBackoffStatus("casey@davidson.edu", IP, at)).toMatchObject({
      blocked: false,
    });
    expect((await reserveCodeGuess("0123456789abcdef01234567", at)).allowed).toBe(true);
    expect(await RateLimit.countDocuments()).toBe(0);
  });
});

describe("purge times survive a pinned clock (review regression: TTL deleted live counters)", () => {
  it("purgeTime is the logical end in production and real clock + remaining when now() is pinned", () => {
    const realNow = new Date();
    const end = new Date(realNow.getTime() + 900_000);
    expect(Math.abs(purgeTime(end, realNow).getTime() - end.getTime())).toBeLessThan(1000);
    // Pinned in the past: the logical end is long gone in real time, the purge time is not.
    const pinnedEnd = plus(900_000);
    const purge = purgeTime(pinnedEnd, at);
    expect(purge.getTime()).toBeGreaterThan(Date.now() + 890_000);
  });

  it("gives counters, streaks and known-IP records a purge time in the real future", async () => {
    await consumeLoginIpLimit(IP, at);
    await consumeMailAllowance("register-mail", "casey@davidson.edu", at);
    await recordLoginFailure("casey@davidson.edu", IP, at);
    await recordLoginSuccess("casey@davidson.edu", OTHER_IP, at);
    await reserveCodeGuess("0123456789abcdef01234567", at);
    const docs = await RateLimit.collection.find({}).toArray();
    expect(docs).toHaveLength(6);
    for (const doc of docs) {
      expect((doc.expiresAt as Date).getTime(), doc.key as string).toBeGreaterThan(Date.now());
    }
    // The logical times stay on the pinned clock.
    const streak = docs.find((d) => d.key === loginBackoffKey("casey@davidson.edu", IP));
    expect(streak?.lastFailureAt).toEqual(at);
  });

  it("keys windows exactly like the shared helper and leaves production counters alone", async () => {
    const realNow = new Date();
    await consumeAuthLimit("probe:user:x", 3, 3600, realNow);
    const doc = await RateLimit.collection.findOne({ key: "probe:user:x" });
    expect(doc?.windowStart).toEqual(fixedWindowStart(realNow, 3600));
    expect(doc?.expiresAt).toEqual(new Date(fixedWindowStart(realNow, 3600).getTime() + 3_600_000));
  });
});

describe("reserve / release (only failures count)", () => {
  it("allows 10 failed sign-in attempts per 15 minutes per IP; released attempts do not count", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await consumeLoginIpLimit(IP, at)).allowed).toBe(true);
      await releaseLoginIpLimit(IP, at); // a successful sign-in
    }
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await consumeLoginIpLimit(IP, at));
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10]).toMatchObject({ allowed: false });
    expect((await consumeLoginIpLimit(OTHER_IP, at)).allowed).toBe(true);
  });

  it("budgets 10 wrong codes a day per account; a right code gives its guess back", async () => {
    const userId = "0123456789abcdef01234567";
    for (let i = 0; i < 3; i++) {
      await reserveCodeGuess(userId, at);
      await releaseCodeGuess(userId, at);
    }
    for (let i = 0; i < CODE_FAILURES_PER_DAY; i++) {
      expect(await codeGuessesExhausted(userId, at)).toMatchObject({ exhausted: false });
      expect((await reserveCodeGuess(userId, at)).allowed).toBe(true);
    }
    expect(await codeGuessesExhausted(userId, at)).toMatchObject({ exhausted: true });
    expect((await reserveCodeGuess(userId, at)).allowed).toBe(false);
    expect(await RateLimit.collection.countDocuments({ key: codeFailureKey(userId) })).toBe(1);
    // The next UTC day starts a new budget.
    const tomorrow = new Date(fixedWindowStart(at, 86_400).getTime() + 86_400_000);
    expect(await codeGuessesExhausted(userId, tomorrow)).toMatchObject({ exhausted: false });
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
