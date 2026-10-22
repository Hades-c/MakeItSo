import "server-only";
import { MEETING_DAYS, type Meeting, type MeetingDay } from "@/lib/types/catalog";
import { ConflictInputSchema, type ConflictInput, type ScheduleConflict } from "@/lib/types/plan";

/**
 * Time conflicts between sections (PLAN §5 "Sections", "WebTree list"). Pure; used by the WebTree list, Add to
 * plan, the course page's week grid and the day schedule.
 *
 * - Every meeting with days and a start/end time counts, the "second meeting time" rows included; TBA meetings
 *   (no days or no start) never conflict.
 * - Two meetings conflict when they share a day and their times overlap (end is exclusive: 10:20 and 10:20 touch,
 *   they do not overlap).
 * - Cross-listed siblings are one class: two inputs never conflict when either lists the other's CRN in its
 *   `crossListings` (matched by CRN, never by code). The same CRN twice is the same section.
 * - Output order: pairs in input order (a before b), then by day (M T W R F S U), then start time; each distinct
 *   (pair, day, window) once.
 */

interface TimedMeeting {
  days: readonly MeetingDay[];
  start: string;
  end: string;
}

const DAY_ORDER = new Map<MeetingDay, number>(MEETING_DAYS.map((day, index) => [day, index]));

/** A meeting that can be placed on the week grid (days, start and end known, not TBA). */
export function isTimedMeeting(meeting: Meeting): meeting is Meeting & TimedMeeting {
  return (
    !meeting.tba &&
    meeting.days.length > 0 &&
    meeting.start !== null &&
    meeting.end !== null &&
    meeting.start < meeting.end
  );
}

function timed(meetings: readonly Meeting[]): TimedMeeting[] {
  return meetings.filter(isTimedMeeting);
}

/** True when `a` and `b` are one class (the same CRN, or cross-listed siblings by CRN). */
export function areSiblings(
  a: Pick<ConflictInput, "crn" | "crossListings">,
  b: Pick<ConflictInput, "crn" | "crossListings">,
): boolean {
  if (String(a.crn) === String(b.crn)) return true;
  const listsB = (a.crossListings ?? []).some((listing) => String(listing.crn) === String(b.crn));
  const listsA = (b.crossListings ?? []).some((listing) => String(listing.crn) === String(a.crn));
  return listsA || listsB;
}

export function detectConflictsImpl(sections: readonly ConflictInput[]): ScheduleConflict[] {
  const parsed = sections.map((section) => ConflictInputSchema.parse(section));
  const out: ScheduleConflict[] = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const a = parsed[i]!;
    const aMeetings = timed(a.meetings);
    if (aMeetings.length === 0) continue;
    for (let j = i + 1; j < parsed.length; j += 1) {
      const b = parsed[j]!;
      if (areSiblings(a, b)) continue;
      const bMeetings = timed(b.meetings);
      const found = new Map<string, ScheduleConflict>();
      for (const ma of aMeetings) {
        for (const mb of bMeetings) {
          if (!(ma.start < mb.end && mb.start < ma.end)) continue;
          const start = ma.start > mb.start ? ma.start : mb.start;
          const end = ma.end < mb.end ? ma.end : mb.end;
          for (const day of ma.days) {
            if (!mb.days.includes(day)) continue;
            const key = `${day}|${start}|${end}`;
            if (!found.has(key)) {
              found.set(key, {
                a: { crn: a.crn, courseCode: a.courseCode },
                b: { crn: b.crn, courseCode: b.courseCode },
                day,
                start,
                end,
              });
            }
          }
        }
      }
      out.push(
        ...[...found.values()].sort(
          (x, y) =>
            (DAY_ORDER.get(x.day) ?? 0) - (DAY_ORDER.get(y.day) ?? 0) ||
            x.start.localeCompare(y.start),
        ),
      );
    }
  }
  return out;
}

const DAY_NAMES: Readonly<Record<MeetingDay, string>> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
  S: "Sat",
  U: "Sun",
};

/** "Mon 10:30–11:20" for messages. */
export function conflictWindowLabel(conflict: Pick<ScheduleConflict, "day" | "start" | "end">) {
  return `${DAY_NAMES[conflict.day]} ${conflict.start}–${conflict.end}`;
}
