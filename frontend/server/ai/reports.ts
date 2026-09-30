import "server-only";
import mongoose from "mongoose";
import type { AiFeature } from "@/lib/types/ai";
import AiCache from "@/models/AiCache";
import { REPORTS_TO_HIDE } from "@/server/ai/config";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";

/**
 * "Report this" on shared entries and the admin purge (PLAN §6.1 W6 "Shared entries").
 *
 *   - A report adds the student to the entry's reporters (a set: reporting twice counts once). With 3 distinct
 *     reporters the entry is hidden pending review; nobody sees it until an admin purges it (it is then
 *     regenerated on the next view) — a hidden entry is never regenerated over. One atomic update.
 *   - The key of a course-about entry is its provenance.inputHash; of a professor summary "rmp:<legacyId>".
 *   - Purge (admin): delete one entry or every entry of a feature (personal entries included).
 */

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
  const at = now();
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null;
  const userIds = { $ifNull: ["$reports.userIds", []] };
  const doc = await AiCache.collection.findOneAndUpdate(
    { feature: input.feature, scope: "shared", userId: null, key: input.key },
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
                  [{ userId: reporter, reason, at }],
                ],
              },
            ],
          },
          "reports.userIds": { $setUnion: [userIds, [reporter]] },
        },
      },
      { $set: { "reports.count": { $size: "$reports.userIds" } } },
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
    ],
    { returnDocument: "after" },
  );
  if (!doc) throw new ApiError(404, "not_found", "That AI answer does not exist (any more).");
  const reports = (doc.reports as { count?: number } | undefined)?.count ?? 0;
  return { reports, hidden: doc.hidden === true };
}

/** Admin purge: one entry (`key`) or every entry of the feature. Returns how many were deleted. */
export async function purgeEntries(input: { feature: AiFeature; key?: string }): Promise<number> {
  await getDb();
  const filter = input.key
    ? { feature: input.feature, key: input.key }
    : { feature: input.feature };
  return (await AiCache.deleteMany(filter)).deletedCount;
}
