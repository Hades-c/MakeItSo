import "server-only";
import mongoose from "mongoose";
import type { AiFeature } from "@/lib/types/ai";
import AiCache from "@/models/AiCache";
import { REPORTS_TO_HIDE, TTL_MS } from "@/server/ai/config";
import { quotaSubject } from "@/server/ai/usage";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";

/**
 * "Report this" on shared entries and the admin purge (PLAN §6.1 W6 "Shared entries").
 *
 *   - A report adds the student to the entry's reporters (a set: reporting twice counts once). Reporters are
 *     counted by MAILBOX (the quota subject: the canonical address, so "+tag" aliases of one inbox are one
 *     reporter), not by account. With 3 distinct reporting mailboxes the entry is hidden pending review, in the same atomic update: its purge time (expiresAt) moves a
 *     year ahead so the TTL monitor cannot delete it, reads return it as hidden whatever its validUntil
 *     (server/ai/cache.ts), and writes never overwrite it, so neither a student's view nor the pre-generation or
 *     weekly job regenerates it. Nobody sees an answer for it until an admin purges it (it is then regenerated on
 *     the next view).
 *   - The client reports what it was shown: `key` is the entry's provenance.inputHash (for course-about that is
 *     also the cache key; a professor summary is stored under "rmp:<legacyId>", which the client never sees).
 *   - Purge (admin): delete one entry or every entry of a feature (personal entries included).
 */

/**
 * The number of distinct reporters of an entry: the distinct `reporter` (mailbox subject) of its report entries;
 * an entry written before reporters were recorded counts by its userId. (An aggregation expression, shared with
 * the account eraser, which recomputes it after removing a student's reports.)
 */
export const REPORTER_COUNT = {
  $size: {
    $setUnion: [
      {
        $map: {
          input: { $ifNull: ["$reports.entries", []] },
          as: "entry",
          in: { $ifNull: ["$$entry.reporter", { $toString: "$$entry.userId" }] },
        },
      },
    ],
  },
} as const;

export interface ReportOutcome {
  reports: number;
  hidden: boolean;
}

export async function reportEntry(
  userId: string,
  input: { feature: "course-about" | "professor-summary"; key: string; reason?: string },
): Promise<ReportOutcome> {
  if (!mongoose.isValidObjectId(userId))
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  await getDb();
  const reporter = new mongoose.Types.ObjectId(userId);
  const mailbox = await quotaSubject(userId);
  const at = now();
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null;
  // Kept for the admin: never before the real clock plus a year (FIXTURES_NOW may be pinned in the past).
  const keepUntil = new Date(Math.max(at.getTime(), Date.now()) + TTL_MS.hidden);
  const userIds = { $ifNull: ["$reports.userIds", []] };
  const doc = await AiCache.collection.findOneAndUpdate(
    { feature: input.feature, scope: "shared", userId: null, inputHash: input.key },
    [
      {
        $set: {
          "reports.entries": {
            $cond: [
              { $in: [reporter, userIds] },
              { $ifNull: ["$reports.entries", []] },
              {
                $concatArrays: [
                  { $ifNull: ["$reports.entries", []] },
                  [{ userId: reporter, reporter: mailbox, reason, at }],
                ],
              },
            ],
          },
          "reports.userIds": { $setUnion: [userIds, [reporter]] },
        },
      },
      { $set: { "reports.count": REPORTER_COUNT } },
      {
        $set: {
          hidden: {
            $or: [{ $eq: ["$hidden", true] }, { $gte: ["$reports.count", REPORTS_TO_HIDE] }],
          },
        },
      },
      {
        $set: {
          hiddenAt: {
            $cond: [
              {
                $and: [
                  { $eq: ["$hidden", true] },
                  { $eq: [{ $ifNull: ["$hiddenAt", null] }, null] },
                ],
              },
              at,
              { $ifNull: ["$hiddenAt", null] },
            ],
          },
        },
      },
      {
        $set: {
          expiresAt: {
            $cond: [{ $eq: ["$hidden", true] }, { $max: ["$expiresAt", keepUntil] }, "$expiresAt"],
          },
        },
      },
    ],
    { returnDocument: "after" },
  );
  if (!doc) throw new ApiError(404, "not_found", "That AI answer does not exist (any more).");
  const reports = (doc.reports as { count?: number } | undefined)?.count ?? 0;
  return { reports, hidden: doc.hidden === true };
}

/**
 * Admin purge: one entry or every entry of the feature. `key` is a cache key ("rmp:<legacyId>", a term code…) or a
 * provenance.inputHash (what a report names). Returns how many were deleted.
 */
export async function purgeEntries(input: { feature: AiFeature; key?: string }): Promise<number> {
  await getDb();
  if (!input.key) return (await AiCache.deleteMany({ feature: input.feature })).deletedCount;
  const byKey = await AiCache.deleteMany({ feature: input.feature, key: input.key });
  const byHash = await AiCache.deleteMany({ feature: input.feature, inputHash: input.key });
  return byKey.deletedCount + byHash.deletedCount;
}
