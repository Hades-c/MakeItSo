import "server-only";
import mongoose from "mongoose";
import { COURSE_CODE_PATTERN } from "@/lib/course-code";
import type { StudentDeadline } from "@/lib/types/plan";
import Plan from "@/models/Plan";
import { getDb } from "@/server/db";
import { userObjectId } from "@/server/plan/context";
import { ensurePlanDoc, MAX_DEADLINES, readPlanDoc } from "@/server/plan/store";

/**
 * The plan deadlines imported from a student's Moodle calendar (origin "moodle", keyed by Moodle's UID in
 * `externalUid`; server/moodle runs the sync). They live with the student's other deadlines, so Today's Due for
 * you, the timeline and the day summary list them like any other, tagged "course-site" (Moodle).
 *
 * A sync replaces the student's Moodle deadlines in one atomic update with what the feed says now:
 *   - an event in the feed is added, or updated in place (same id) when its title, time or course changed;
 *   - a Moodle deadline missing from the feed is removed when it falls inside the window the feed covers
 *     (`windowStart` onwards: Moodle's "recent" is the last 5 days); an older one is kept as history;
 *   - the other deadlines (typed, syllabus) are never touched, and the list stays within MAX_DEADLINES: when room
 *     runs short, the feed's events come first (upcoming soonest first, as the caller orders them), then the
 *     newest history; what did not fit is counted in `capped`.
 */

export interface MoodleDeadlineInput {
  uid: string;
  title: string;
  /** ISO instant. */
  dueAt: string;
  courseCode?: string;
}

export interface MoodleDeadlineSync {
  /** Moodle deadlines in the plan after this sync. */
  imported: number;
  added: number;
  updated: number;
  removed: number;
  /** Feed events or history left out for lack of room (MAX_DEADLINES). */
  capped: number;
}

type Raw = Record<string, unknown>;

function rawDeadlines(doc: Raw | null): Raw[] {
  const value = doc?.deadlines;
  return Array.isArray(value) ? (value as Raw[]) : [];
}

function dueMs(raw: Raw): number {
  return raw.dueAt instanceof Date ? raw.dueAt.getTime() : Date.parse(String(raw.dueAt));
}

export async function replaceMoodleDeadlinesImpl(
  userId: string,
  events: readonly MoodleDeadlineInput[],
  { windowStart }: { windowStart: Date },
): Promise<MoodleDeadlineSync> {
  const oid = userObjectId(userId);
  await ensurePlanDoc(userId, oid, { create: true });
  const current = rawDeadlines(await readPlanDoc(oid, { deadlines: 1 }));
  const others = current.filter((raw) => raw.origin !== "moodle");
  const moodle = current.filter((raw) => raw.origin === "moodle");
  const byUid = new Map(moodle.map((raw) => [String(raw.externalUid ?? ""), raw]));
  const feedUids = new Set(events.map((event) => event.uid));

  let room = Math.max(0, MAX_DEADLINES - others.length);
  let added = 0;
  let updated = 0;
  const next: Raw[] = [];
  for (const event of events) {
    if (room === 0) break;
    room--;
    const previous = byUid.get(event.uid);
    const courseCode =
      event.courseCode && COURSE_CODE_PATTERN.test(event.courseCode) ? event.courseCode : undefined;
    const doc: Raw = {
      _id: previous?._id ?? new mongoose.Types.ObjectId(),
      title: event.title,
      dueAt: new Date(event.dueAt),
      ...(courseCode ? { courseCode } : {}),
      origin: "moodle",
      externalUid: event.uid,
    };
    if (!previous) added++;
    else if (
      previous.title !== doc.title ||
      dueMs(previous) !== (doc.dueAt as Date).getTime() ||
      (previous.courseCode ?? undefined) !== courseCode
    ) {
      updated++;
    }
    next.push(doc);
  }
  const history = moodle
    .filter(
      (raw) => !feedUids.has(String(raw.externalUid ?? "")) && dueMs(raw) < windowStart.getTime(),
    )
    .sort((a, b) => dueMs(b) - dueMs(a));
  const keptHistory = history.slice(0, room);
  next.push(...keptHistory);
  const dropped = events.length + history.length - next.length;
  const removed = moodle.filter(
    (raw) => !feedUids.has(String(raw.externalUid ?? "")) && dueMs(raw) >= windowStart.getTime(),
  ).length;

  // One update: keep every non-Moodle deadline as it is now (one added since the read above included), swap in
  // the new Moodle list, and never exceed MAX_DEADLINES (Moodle ones go first if a concurrent add left no room).
  await Plan.updateOne(
    { userId: oid },
    [
      {
        $set: {
          deadlines: {
            $slice: [
              {
                $concatArrays: [
                  {
                    $filter: {
                      input: { $ifNull: ["$deadlines", []] },
                      cond: { $ne: ["$$this.origin", "moodle"] },
                    },
                  },
                  // $literal: stored as given, never read as expressions (a title may start with "$").
                  { $literal: next },
                ],
              },
              MAX_DEADLINES,
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );
  return { imported: next.length, added, updated, removed, capped: dropped };
}

/** Remove every Moodle deadline from the plan (disconnect with "also remove"). Returns how many. */
export async function removeMoodleDeadlinesImpl(userId: string): Promise<number> {
  const oid = userObjectId(userId);
  await getDb();
  const doc = await readPlanDoc(oid, { deadlines: 1 });
  const count = rawDeadlines(doc).filter((raw) => raw.origin === "moodle").length;
  if (count === 0) return 0;
  await Plan.updateOne({ userId: oid }, { $pull: { deadlines: { origin: "moodle" } } });
  return count;
}

/** The Moodle deadlines in a list of plan deadlines (what /syllabi shows as imported). */
export function moodleDeadlinesOf(deadlines: readonly StudentDeadline[]): StudentDeadline[] {
  return deadlines.filter((deadline) => deadline.origin === "moodle");
}
