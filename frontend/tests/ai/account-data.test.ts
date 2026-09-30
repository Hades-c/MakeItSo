import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertStudent } from "./helpers";
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
import { consumeGenerationQuota, recordUsage, usageSubject } from "@/server/ai/usage";
import { getDb } from "@/server/db";

/** W6 in the account data registry: "ai" = personal aicache_v2 entries + reports + aiusages (PLAN §9). */

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
  await reportEntry(me.id, { feature: "course-about", key: "shared-key", reason: "Looks wrong" });
  await reportEntry(other.id, { feature: "course-about", key: "shared-key" });
  return { me, other };
}

describe('the "ai" registration', () => {
  it("is loaded from server/ai through ACCOUNT_DATA_MODULES", async () => {
    await loadAccountDataRegistrations();
    expect(accountDataNames()).toContain("ai");
  });

  it("exports only this student's entries, reports and usage", async () => {
    const { me } = await seed();
    const exported = (await exportAccountData(me.id)).ai as {
      aicache_v2: { feature: string; key: string; data: unknown }[];
      reports: { feature: string; key: string; reason: string | null }[];
      aiusages: { feature: string; generations: number }[];
    };
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

  it("erases them (and W3's eraser takes the quota counters), leaving the other student and the shared entry", async () => {
    const { me, other } = await seed();
    const removed = await eraseAccountData(me.id);
    expect(removed.ai).toBe(3);
    expect(removed.ratelimits).toBe(1);

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
    expect(await RateLimit.countDocuments({ key: new RegExp(`:user:${other.id}$`) })).toBe(1);

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
    });
    expect((await eraseAccountData("not-an-id")).ai).toBe(0);
  });
});
