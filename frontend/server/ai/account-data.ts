import "server-only";
import mongoose from "mongoose";
import AiCache from "@/models/AiCache";
import AiUsage from "@/models/AiUsage";
import { registerAccountData } from "@/server/account/erasers";
import { usageSubject } from "@/server/ai/usage";
import { getDb } from "@/server/db";

/**
 * W6's per-user data in the account registry (PLAN §4.1.12, §9 "Account data"), as one registration "ai":
 *   aicache_v2  the student's personal entries (plan suggestions, career plans, cold e-mails) and the reports
 *               they filed on shared entries (their id and reason are removed from those entries on erase; the
 *               shared entries themselves hold no personal data and stay);
 *   aiusages    the usage counters under the student's pseudonymous subject (server/ai/usage.ts usageSubject).
 * The daily quota counters live in `ratelimits` ("ai-generations-<day>:user:<id>") and are exported and erased
 * by W3's ratelimits registration.
 */

function isObjectId(userId: string): boolean {
  return /^[a-f0-9]{24}$/.test(userId) && mongoose.isValidObjectId(userId);
}

interface ReportEntry {
  userId?: unknown;
  reason?: string | null;
  at?: Date;
}

registerAccountData("ai", {
  async export(userId) {
    if (!isObjectId(userId)) return { aicache_v2: [], reports: [], aiusages: [] };
    await getDb();
    const id = new mongoose.Types.ObjectId(userId);
    const [personal, reported, usage] = await Promise.all([
      AiCache.find({ scope: "user", userId: id })
        .select("feature key status data provenance fallbackUsed validUntil createdAt -_id")
        .lean(),
      AiCache.find({ scope: "shared", "reports.userIds": id })
        .select("feature key reports.entries -_id")
        .lean(),
      AiUsage.find({ userId: usageSubject(userId) })
        .select(
          "day feature generations regenerations cacheHits failures fallbacks inputTokens outputTokens cacheReadTokens cacheCreationTokens models -_id",
        )
        .lean(),
    ]);
    return {
      aicache_v2: personal,
      reports: reported.map((entry) => {
        const mine = ((entry.reports?.entries ?? []) as ReportEntry[]).find(
          (report) => String(report.userId) === userId,
        );
        return {
          feature: entry.feature,
          key: entry.key,
          reason: mine?.reason ?? null,
          at: mine?.at ?? null,
        };
      }),
      aiusages: usage,
    };
  },
  async erase(userId) {
    if (!isObjectId(userId)) return 0;
    await getDb();
    const id = new mongoose.Types.ObjectId(userId);
    const personal = await AiCache.deleteMany({ scope: "user", userId: id });
    const reports = await AiCache.collection.updateMany(
      { scope: "shared", "reports.userIds": id },
      [
        {
          $set: {
            "reports.userIds": { $setDifference: [{ $ifNull: ["$reports.userIds", []] }, [id]] },
            "reports.entries": {
              $filter: {
                input: { $ifNull: ["$reports.entries", []] },
                cond: { $ne: ["$$this.userId", id] },
              },
            },
          },
        },
        { $set: { "reports.count": { $size: "$reports.userIds" } } },
      ],
    );
    const usage = await AiUsage.deleteMany({ userId: usageSubject(userId) });
    return personal.deletedCount + reports.modifiedCount + usage.deletedCount;
  },
});
