import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertStudent, stubAuthEnv } from "./helpers";
import AiCache from "@/models/AiCache";
import AiUsage from "@/models/AiUsage";
import RateLimit from "@/models/RateLimit";
import {
  accountDataNames,
  eraseAccountData,
  exportAccountData,
  loadAccountDataRegistrations,
} from "@/server/account/erasers";
import { writePersonal, writeShared } from "@/server/ai/cache";
import { reportEntry } from "@/server/ai/reports";
import {
  consumeGenerationQuota,
  ERASED_SUBJECT,
  quotaSubject,
  recordUsage,
  tokensUsedToday,
  usageSubject,
} from "@/server/ai/usage";
import { getDb } from "@/server/db";

/**
 * W6 in the account data registry: "ai" = personal aicache_v2 entries + reports + aiusages (PLAN §9), and the
 * mailbox-keyed quota counters in the export (they are not erased: see server/ai/account-data.ts).
 */

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => {
  stubAuthEnv();
});

afterEach(async () => {
  await testDb.clear();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await testDb.stop();
});

const entry = (data: unknown) => ({
  inputHash: "h",
  promptVersion: "v/1",
  status: "ok" as const,
  data,
  servedModel: "claude-sonnet-5-5",
  fallbackUsed: false,
  ttlMs: 86_400_000,
});

async function seed() {
  const me = await insertStudent({ email: "me@davidson.edu" });
  const other = await insertStudent({ email: "other@davidson.edu" });
  for (const user of [me, other]) {
    await writePersonal("plan-suggestions", user.id, "202602", entry({ owner: user.email }));
    await recordUsage({
      userId: user.id,
      feature: "plan-suggestions",
      kind: "generation",
      usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    });
    await consumeGenerationQuota(user.id);
  }
  await writeShared("course-about", "shared-key", entry({ summary: "Shared" }));
  // Reports name the entry by the provenance.inputHash the student was shown.
  await reportEntry(me.id, { feature: "course-about", key: "h", reason: "Looks wrong" });
  await reportEntry(other.id, { feature: "course-about", key: "h" });
  return { me, other };
}

describe('the "ai" registration', () => {
  it("is loaded from server/ai through ACCOUNT_DATA_MODULES", async () => {
    await loadAccountDataRegistrations();
    expect(accountDataNames()).toContain("ai");
  });

  it("exports only this student's entries, reports, usage and quota counters", async () => {
    const { me } = await seed();
    const exported = (await exportAccountData(me.id)).ai as {
      aicache_v2: { feature: string; key: string; data: unknown }[];
      reports: { feature: string; key: string; reason: string | null }[];
      aiusages: { feature: string; generations: number }[];
      quotas: { key: string; count: number }[];
    };
    expect(exported.quotas).toEqual([
      expect.objectContaining({
        key: `ai-generations-20260930:${await quotaSubject(me.id)}`,
        count: 1,
      }),
    ]);
    expect(exported.aicache_v2).toEqual([
      expect.objectContaining({
        feature: "plan-suggestions",
        key: "202602",
        data: { owner: "me@davidson.edu" },
      }),
    ]);
    expect(exported.reports).toEqual([
      { feature: "course-about", key: "shared-key", reason: "Looks wrong", at: expect.any(Date) },
    ]);
    expect(exported.aiusages).toEqual([
      expect.objectContaining({ feature: "plan-suggestions", generations: 1, inputTokens: 5 }),
    ]);
    const text = JSON.stringify(exported);
    expect(text).not.toContain("other@davidson.edu");
  });

  it("erases them, leaving the other student and the shared entry; the budget total and the mailbox quota stay", async () => {
    const { me, other } = await seed();
    const subject = await quotaSubject(me.id);
    const tokensBefore = await tokensUsedToday();
    const removed = await eraseAccountData(me.id);
    expect(removed.ai).toBe(3);
    // The quota counters are keyed by the mailbox, not the account: W3's eraser finds none of them…
    expect(removed.ratelimits).toBe(0);
    // …and they stay (until their window ends), so deleting and re-registering does not reset them.
    expect(await RateLimit.countDocuments({ key: new RegExp(`:${subject}$`) })).toBe(1);
    // Erasing never lowers the budget breaker's total: the rows moved to the non-personal "erased" row.
    expect(await tokensUsedToday()).toBe(tokensBefore);
    expect(await AiUsage.countDocuments({ userId: usageSubject(ERASED_SUBJECT) })).toBe(1);

    expect(
      await AiCache.countDocuments({ scope: "user", userId: new mongoose.Types.ObjectId(me.id) }),
    ).toBe(0);
    expect(
      await AiCache.countDocuments({
        scope: "user",
        userId: new mongoose.Types.ObjectId(other.id),
      }),
    ).toBe(1);
    expect(await AiUsage.countDocuments({ userId: usageSubject(me.id) })).toBe(0);
    expect(await AiUsage.countDocuments({ userId: usageSubject(other.id) })).toBe(1);
    expect(await RateLimit.countDocuments({ key: new RegExp(`:user:${me.id}$`) })).toBe(0);

    const shared = await AiCache.findOne({ key: "shared-key" }).lean();
    expect(shared!.reports!.userIds.map(String)).toEqual([other.id]);
    expect(shared!.reports!.count).toBe(1);
    expect(shared!.reports!.entries.map((e) => String(e.userId))).toEqual([other.id]);
  });

  it("does nothing for an id that is not an account id", async () => {
    await seed();
    expect((await exportAccountData("not-an-id")).ai).toEqual({
      aicache_v2: [],
      reports: [],
      aiusages: [],
      quotas: [],
    });
    expect((await eraseAccountData("not-an-id")).ai).toBe(0);
  });
});
