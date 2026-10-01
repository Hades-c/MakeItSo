import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, stubAuthEnv } from "../w3/helpers";
import AiUsage from "@/models/AiUsage";
import RateLimit from "@/models/RateLimit";
import { DAILY_GENERATION_QUOTA, DAILY_REGENERATION_QUOTA } from "@/server/ai/config";
import {
  aiDay,
  budgetFailure,
  consumeGenerationQuota,
  consumeQuotas,
  consumeRegenerationQuota,
  ERASED_SUBJECT,
  eraseUsage,
  mailboxKey,
  quotaKey,
  quotaSubject,
  recordUsage,
  refundQuotas,
  REGENERATION_QUOTA_MESSAGE,
  tokensUsedToday,
  usageSubject,
} from "@/server/ai/usage";
import { getDb } from "@/server/db";

/** Usage counters, the daily token budget and the per-student quotas (PLAN §6.1 W6 "Quotas and budget"). */

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const USER = "64b0000000000000000000a1";
const OTHER = "64b0000000000000000000b2";
const usage = (input: number, output: number, cacheRead = 0, cacheCreation = 0) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheCreationTokens: cacheCreation,
});

describe("usage records", () => {
  it("counts per America/New_York day, pseudonymous subject and feature", async () => {
    await recordUsage({
      userId: USER,
      feature: "course-about",
      kind: "generation",
      usage: usage(100, 20, 5, 7),
      servedModel: "claude-sonnet-5-5",
    });
    await recordUsage({
      userId: USER,
      feature: "course-about",
      kind: "generation",
      usage: usage(50, 10),
      servedModel: "claude-sonnet-5",
      fallbackUsed: true,
      failed: true,
    });
    await recordUsage({
      userId: USER,
      feature: "course-about",
      kind: "cache-hit",
      servedModel: "claude-sonnet-5-5",
    });
    await recordUsage({
      userId: null,
      feature: "course-about",
      kind: "generation",
      usage: usage(1, 1),
    });

    const docs = await AiUsage.find().lean();
    expect(docs).toHaveLength(2);
    const mine = docs.find((d) => d.userId.equals(usageSubject(USER)))!;
    expect(mine).toMatchObject({
      day: "2026-09-30",
      feature: "course-about",
      generations: 2,
      cacheHits: 1,
      failures: 1,
      fallbacks: 1,
      regenerations: 0,
      inputTokens: 150,
      outputTokens: 30,
      cacheReadTokens: 5,
      cacheCreationTokens: 7,
    });
    expect(mine.models.sort()).toEqual(["claude-sonnet-5", "claude-sonnet-5-5"]);
    expect(mine.expiresAt.getTime()).toBeGreaterThan(Date.now() + 80 * 86_400_000);
  });

  it("never stores the account id: the subject is a stable hash of it", async () => {
    expect(usageSubject(USER).equals(usageSubject(USER))).toBe(true);
    expect(usageSubject(USER).equals(usageSubject(OTHER))).toBe(false);
    expect(usageSubject(USER).toString()).not.toBe(USER);
    expect(usageSubject(null).equals(usageSubject("system"))).toBe(true);
    await recordUsage({
      userId: USER,
      feature: "cold-email",
      kind: "generation",
      usage: usage(1, 1),
    });
    const raw = await AiUsage.collection.find().toArray();
    expect(JSON.stringify(raw)).not.toContain(USER);
  });

  it("uses the Davidson day, not the UTC day", () => {
    expect(aiDay(new Date("2026-10-01T03:30:00Z"))).toBe("2026-09-30");
    expect(aiDay(new Date("2026-10-01T04:30:00Z"))).toBe("2026-10-01");
  });
});

describe("AI_DAILY_TOKEN_BUDGET", () => {
  it("sums today's tokens of every subject (cache tokens and iterations included) and opens the breaker at the budget", async () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "1000");
    await recordUsage({
      userId: USER,
      feature: "course-about",
      kind: "generation",
      usage: usage(300, 100, 50, 50),
    });
    await recordUsage({
      userId: OTHER,
      feature: "plan-suggestions",
      kind: "generation",
      usage: usage(200, 100),
    });
    expect(await tokensUsedToday()).toBe(800);
    expect(await budgetFailure()).toBeNull();
    await recordUsage({
      userId: null,
      feature: "course-about",
      kind: "generation",
      usage: usage(150, 50),
    });
    expect(await tokensUsedToday()).toBe(1000);
    expect(await budgetFailure()).toEqual({ kind: "budget", message: "AI is paused for today." });
  });

  it("forgets yesterday", async () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "100");
    await AiUsage.create({
      day: "2026-09-29",
      userId: usageSubject(USER),
      feature: "course-about",
      inputTokens: 1_000,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await tokensUsedToday()).toBe(0);
    expect(await budgetFailure()).toBeNull();
  });

  it("a zero budget pauses everything", async () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "0");
    expect((await budgetFailure())?.kind).toBe("budget");
  });
});

describe("quotas (server/http consumeRateLimit)", () => {
  it(`allows ${DAILY_GENERATION_QUOTA} cache-miss generations a day per student, across features`, async () => {
    for (let i = 0; i < DAILY_GENERATION_QUOTA; i++) {
      expect(await consumeGenerationQuota(USER)).toBeNull();
    }
    expect(await consumeGenerationQuota(USER)).toEqual({
      kind: "quota",
      message: "You have used today's AI requests. They reset tomorrow.",
    });
    // Another student is unaffected.
    expect(await consumeGenerationQuota(OTHER)).toBeNull();
  });

  it(`allows ${DAILY_REGENERATION_QUOTA} regenerations a day`, async () => {
    for (let i = 0; i < DAILY_REGENERATION_QUOTA; i++) {
      expect(await consumeRegenerationQuota(USER)).toBeNull();
    }
    expect((await consumeRegenerationQuota(USER))?.kind).toBe("quota");
  });

  it("resets at midnight in Davidson", async () => {
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T23:50:00-04:00");
    for (let i = 0; i < DAILY_GENERATION_QUOTA; i++) await consumeGenerationQuota(USER);
    expect((await consumeGenerationQuota(USER))?.kind).toBe("quota");
    vi.stubEnv("FIXTURES_NOW", "2026-10-01T00:05:00-04:00");
    expect(await consumeGenerationQuota(USER)).toBeNull();
  });

  it("keeps one counter for the whole Davidson day, across the UTC midnight", async () => {
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T19:30:00-04:00");
    await consumeGenerationQuota(USER);
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T20:30:00-04:00"); // after 00:00 UTC
    await consumeGenerationQuota(USER);
    const counters = await RateLimit.find({
      key: quotaKey("ai-generations", `user:${USER}`, "2026-09-30"),
    }).lean();
    expect(counters).toHaveLength(1);
    expect(counters[0]?.count).toBe(2);
  });

  it("keys a student's quotas by the keyed hash of the mailbox, which W3's eraser does not match", async () => {
    stubAuthEnv();
    const student = await insertUser({ email: "Quota.Student@davidson.edu" });
    const subject = await quotaSubject(student.id);
    expect(subject).toBe(`mailbox:${mailboxKey("quota.student@davidson.edu")}`);
    expect(subject).toMatch(/^mailbox:[a-f0-9]{32}$/);
    expect(subject).not.toContain("quota.student");
    const key = quotaKey("ai-generations", subject, "2026-09-30");
    expect(key).toBe(`ai-generations-20260930:${subject}`);
    expect(key).not.toMatch(new RegExp(`^[a-z0-9-]+:user:${student.id}$`));
    expect(key).not.toMatch(/^[a-z0-9-]+:email:/);
    // "+tag" aliases deliver to the same inbox, so they share its quota.
    expect(mailboxKey("Quota.Student+2@davidson.edu")).toBe(
      mailboxKey("quota.student@davidson.edu"),
    );
    expect(mailboxKey("quota+x@gmail.com")).not.toBe(mailboxKey("quota@gmail.com"));
    // Without a stored address (never the case for a verified student) the account id is the subject.
    expect(await quotaSubject(USER)).toBe(`user:${USER}`);
  });

  it("a new account with the same mailbox continues the day's quota", async () => {
    stubAuthEnv();
    const first = await insertUser({ email: "again@davidson.edu" });
    for (let i = 0; i < DAILY_GENERATION_QUOTA; i++) await consumeGenerationQuota(first.id);
    await mongoose.connection
      .collection("users")
      .deleteOne({ _id: new mongoose.Types.ObjectId(first.id) });
    const second = await insertUser({ email: "again@davidson.edu" });
    expect((await consumeGenerationQuota(second.id))?.kind).toBe("quota");
  });

  it("never lets the TTL monitor delete a live counter while now is pinned in the past", async () => {
    vi.stubEnv("FIXTURES_NOW", "2026-01-15T12:00:00-05:00");
    await consumeGenerationQuota(USER);
    const [counter] = await RateLimit.find({
      key: quotaKey("ai-generations", `user:${USER}`, "2026-01-15"),
    }).lean();
    expect(counter!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("is skipped entirely with RATE_LIMITS=off (the e2e server)", async () => {
    vi.stubEnv("RATE_LIMITS", "off");
    for (let i = 0; i < DAILY_GENERATION_QUOTA + 5; i++) {
      expect(await consumeGenerationQuota(USER)).toBeNull();
    }
    expect(await RateLimit.countDocuments()).toBe(0);
  });

  it("ids are account ids (24 hex), as the session carries them", () => {
    expect(mongoose.isValidObjectId(USER)).toBe(true);
  });

  it("takes the generation first: a student out of generations keeps their regenerations", async () => {
    for (let i = 0; i < DAILY_GENERATION_QUOTA; i++) await consumeGenerationQuota(USER);
    expect(await consumeQuotas(USER, { regeneration: true })).toEqual({
      failure: {
        kind: "quota",
        message: "You have used today's AI requests. They reset tomorrow.",
      },
    });
    const regenerations = await RateLimit.find({
      key: quotaKey("ai-regenerations", `user:${USER}`),
    }).lean();
    expect(regenerations).toHaveLength(0);
  });

  it("a regeneration over its limit gives the generation back", async () => {
    for (let i = 0; i < DAILY_REGENERATION_QUOTA; i++) {
      expect("receipt" in (await consumeQuotas(USER, { regeneration: true }))).toBe(true);
    }
    expect(await consumeQuotas(USER, { regeneration: true })).toEqual({
      failure: { kind: "quota", message: REGENERATION_QUOTA_MESSAGE },
    });
    const [generations] = await RateLimit.find({
      key: quotaKey("ai-generations", `user:${USER}`),
    }).lean();
    expect(generations?.count).toBe(DAILY_REGENERATION_QUOTA);
  });

  it("refundQuotas gives back exactly what a receipt took, once", async () => {
    const taken = await consumeQuotas(USER, { regeneration: true });
    if (!("receipt" in taken)) throw new Error("expected a receipt");
    await refundQuotas(taken.receipt);
    await refundQuotas(taken.receipt);
    const counters = await RateLimit.find({ key: /:user:64b0000000000000000000a1$/ }).lean();
    expect(counters.map((c) => c.count)).toEqual([0, 0]);
    // All 20 are available again.
    for (let i = 0; i < DAILY_GENERATION_QUOTA; i++) {
      expect(await consumeGenerationQuota(USER)).toBeNull();
    }
  });
});

describe("erasure never lowers the budget's measure", () => {
  it("folds the student's rows into the non-personal erased row before deleting them", async () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "10000");
    await recordUsage({
      userId: USER,
      feature: "plan-suggestions",
      kind: "generation",
      usage: usage(9_000, 2_000),
      servedModel: "claude-sonnet-5-5",
      failed: true,
    });
    await recordUsage({
      userId: OTHER,
      feature: "plan-suggestions",
      kind: "generation",
      usage: usage(100, 0),
    });
    expect(await tokensUsedToday()).toBe(11_100);
    expect((await budgetFailure())?.kind).toBe("budget");

    expect(await eraseUsage(USER)).toBe(1);
    expect(await tokensUsedToday()).toBe(11_100);
    expect((await budgetFailure())?.kind).toBe("budget");
    expect(await AiUsage.countDocuments({ userId: usageSubject(USER) })).toBe(0);
    const erased = await AiUsage.findOne({ userId: usageSubject(ERASED_SUBJECT) }).lean();
    expect(erased).toMatchObject({
      day: "2026-09-30",
      feature: "plan-suggestions",
      generations: 1,
      failures: 1,
      inputTokens: 9_000,
      outputTokens: 2_000,
      models: ["claude-sonnet-5-5"],
    });

    // A second erased student adds to the same row.
    expect(await eraseUsage(OTHER)).toBe(1);
    expect(await tokensUsedToday()).toBe(11_100);
    expect(await AiUsage.countDocuments()).toBe(1);
    expect(
      (await AiUsage.findOne({ userId: usageSubject(ERASED_SUBJECT) }).lean())?.generations,
    ).toBe(2);
  });
});
