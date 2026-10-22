import "server-only";
import mongoose from "mongoose";
import AiCache from "@/models/AiCache";
import AiUsage from "@/models/AiUsage";
import RateLimit from "@/models/RateLimit";
import { registerAccountData } from "@/server/account/erasers";
import { REPORTER_COUNT } from "@/server/ai/reports";
import { eraseUsage, quotaSubject, usageSubject } from "@/server/ai/usage";
import { getDb } from "@/server/db";

/**
 * W6's per-user data in the account registry (PLAN §4.1.12, §9 "Account data"), as one registration "ai":
 *   aicache_v2  the student's personal entries (plan suggestions, career plans, cold e-mails) and the reports
 *               they filed on shared entries (their id and reason are removed from those entries on erase; the
 *               shared entries themselves hold no personal data and stay);
 *   aiusages    the usage counters under the student's pseudonymous subject (server/ai/usage.ts usageSubject).
 *               On erase their counts are first folded into the non-personal "erased" row of the same day and
 *               feature (eraseUsage), so deleting an account never lowers the budget breaker's daily total.
 *   quotas      the daily quota counters in `ratelimits`, keyed by the keyed hash of the mailbox
 *               ("ai-generations-<day>:mailbox:<hmac>"): exported here, but NOT erased. They name no account,
 *               expire with their window (at most ~2 days) and exist so that deleting an account and registering
 *               the same mailbox again cannot reset the day's AI quota (see the W6 contract requests for the
 *               privacy notice line).
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
    if (!isObjectId(userId)) return { aicache_v2: [], reports: [], aiusages: [], quotas: [] };
    await getDb();
    const id = new mongoose.Types.ObjectId(userId);
    const subject = await quotaSubject(userId);
    const quotaPattern = new RegExp(
      `^ai-(?:re)?generations-\\d{8}:${subject.replace(/[^a-z0-9:]/g, "")}$`,
    );
    const [personal, reported, usage, quotas] = await Promise.all([
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
      RateLimit.find({ key: quotaPattern }).select("key count windowStart expiresAt -_id").lean(),
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
      quotas,
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
        { $set: { "reports.count": REPORTER_COUNT } },
      ],
    );
    const usage = await eraseUsage(userId);
    return personal.deletedCount + reports.modifiedCount + usage;
  },
});
