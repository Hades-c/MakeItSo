import "server-only";
import { after } from "next/server";
import { getFlags } from "@/lib/flags";
import type { MoodleStatus } from "@/lib/types/moodle";
import { ApiError } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";
import {
  connectMoodleImpl,
  disconnectMoodleImpl,
  getMoodleStatusImpl,
  isMoodleConnectedImpl,
  moodleSyncDueImpl,
  syncMoodleImpl,
} from "@/server/moodle/records";

/**
 * Moodle calendar import (/syllabi; PLAN-UX §3, owner decision 2026-10-28). Import from "@/server/moodle".
 *
 *   getMoodleStatus(userId)                  connected?, last synced, last problem, the imported deadlines
 *   isMoodleConnected(userId)                one cheap read (Today's pointer to /syllabi)
 *   connectMoodle(userId, url)               check + fetch once + store encrypted + import (400/503 on failure)
 *   syncMoodle(userId)                       "Sync now" (429 past MOODLE_SYNCS_PER_HOUR)
 *   syncMoodleIfDue(userId)                  Today and /syllabi: in the background after the page, when the last
 *                                            attempt is 6 hours old (no cron); never throws
 *   disconnectMoodle(userId, { removeDeadlines })   forget the URL, optionally the imported deadlines
 *   requireMoodleImport()                    routes: 404 while the flag is off
 *
 * Callers check the `moodle` flag (MOODLE_IMPORT_ENABLED) first; disconnecting works with the flag off too. See
 * server/moodle/records.ts for the rules and the "moodle" account data (registered on import).
 */

/** Routes: 404 while MOODLE_IMPORT_ENABLED is off (getFlags(): a malformed flag fails the route, PLAN §2). */
export function requireMoodleImport(): void {
  if (!getFlags().moodle) {
    throw new ApiError(404, "not_found", "Moodle import is turned off on MakeItSo for now.");
  }
}

export async function getMoodleStatus(userId: string): Promise<MoodleStatus> {
  return getMoodleStatusImpl(userId);
}

export async function isMoodleConnected(userId: string): Promise<boolean> {
  return isMoodleConnectedImpl(userId);
}

export async function connectMoodle(userId: string, url: string): Promise<MoodleStatus> {
  return connectMoodleImpl(userId, url);
}

export async function syncMoodle(userId: string): Promise<MoodleStatus> {
  return syncMoodleImpl(userId, { manual: true });
}

export async function disconnectMoodle(
  userId: string,
  options: { removeDeadlines: boolean },
): Promise<{ removed: number }> {
  return disconnectMoodleImpl(userId, options);
}

/**
 * The lazy sync: when the student's feed is due (connected, last attempt 6+ hours ago, not waiting for the
 * student to reconnect), sync it after the response is sent. Never throws and never delays the page.
 */
export async function syncMoodleIfDue(userId: string): Promise<void> {
  try {
    if (!(await moodleSyncDueImpl(userId))) return;
  } catch (error) {
    console.error("[moodle] could not check whether a sync is due:", error);
    return;
  }
  const run = async () => {
    try {
      await syncMoodleImpl(userId, { manual: false });
    } catch (error) {
      if (error instanceof MissingFixtureError) throw error;
      // The name only: nothing a sync throws carries the feed URL, but its message need not be logged either.
      console.error(
        "[moodle] background sync failed:",
        error instanceof Error ? error.name : "error",
      );
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request (tests, scripts): run it now.
    await run();
  }
}
