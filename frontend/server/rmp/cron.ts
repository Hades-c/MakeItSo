import "server-only";
import { getFlags } from "@/lib/flags";
import type { RmpCronResult, TagSyncResult } from "@/lib/types/ratings";
import SourceSync from "@/models/SourceSync";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { syncRoster } from "@/server/rmp";
import { runTagSync } from "@/server/rmp/tags";

/**
 * The daily RateMyProfessors job behind GET /api/cron/rmp (vercel.json; the route allows 300 s):
 *
 *   1. the roster (server/rmp/roster.ts), only when the last good roster sync is ROSTER_INTERVAL_DAYS or more old
 *      (or there is none), so the roster stays weekly while the cron runs daily;
 *   2. the tag counts (server/rmp/tags.ts) for the rest of the RMP_CRON_BUDGET_MS budget. Each run continues where
 *      the last one stopped, so a first full count of every rated teacher takes a few runs at most and later runs
 *      only recount teachers with new ratings or a month-old count.
 *
 * RMP_ENABLED=false: nothing runs, no network, no database, nothing recorded.
 */

/** The roster is synced again once its last good sync is this old. */
export const ROSTER_INTERVAL_DAYS = 6;
/** The whole job's budget: the route's maxDuration (300 s) minus room for a cold start and the last writes. */
export const RMP_CRON_BUDGET_MS = 240_000;
const DAY_MS = 24 * 60 * 60_000;

const DISABLED = "RateMyProfessors ratings are turned off (RMP_ENABLED=false).";

/** When the roster last synced successfully, if that was under ROSTER_INTERVAL_DAYS ago (then it is skipped). */
async function recentRosterSync(at: Date): Promise<Date | null> {
  await getDb();
  const sync = await SourceSync.findOne({ sourceId: "ratemyprofessors" })
    .select("lastSuccessAt")
    .lean();
  const last = sync?.lastSuccessAt ?? null;
  if (!last) return null;
  const age = at.getTime() - last.getTime();
  return age >= 0 && age < ROSTER_INTERVAL_DAYS * DAY_MS ? last : null;
}

export interface RmpCronOptions {
  /** Monotonic milliseconds (default performance.now). */
  clock?: () => number;
  budgetMs?: number;
}

export async function runRmpCron(options: RmpCronOptions = {}): Promise<RmpCronResult> {
  const clock = options.clock ?? (() => performance.now());
  const started = clock();
  if (!getFlags().rmp) {
    const tags: TagSyncResult = {
      ok: false,
      updated: 0,
      skipped: 0,
      remaining: 0,
      requests: 0,
      outOfTime: false,
      error: DISABLED,
    };
    return { roster: { ...(await syncRoster()), skipped: false }, tags };
  }

  const recent = await recentRosterSync(now());
  const roster: RmpCronResult["roster"] = recent
    ? { skipped: true, lastSuccessAt: recent.toISOString() }
    : { ...(await syncRoster()), skipped: false };

  const budgetMs = (options.budgetMs ?? RMP_CRON_BUDGET_MS) - (clock() - started);
  const tags = await runTagSync({ budgetMs, clock });
  return { roster, tags };
}
