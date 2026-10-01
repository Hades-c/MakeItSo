import "server-only";
import {
  buildDaySummary,
  DEADLINE_WINDOW_DAYS,
  type DaySummary,
  type DaySummaryInput,
  type SummaryDeadline,
} from "@/lib/day-summary";
import type { ClassStanding } from "@/lib/term";
import type { FeedItem } from "@/lib/types/feeds";
import type { DaySchedule, StudentDeadline } from "@/lib/types/plan";
import { breakOn, calendarDeadlineRows, milestonesOn } from "@/server/today/calendar";
import { addDaysToKey, etDay, TODAY_TIME_ZONE, zonedInstant } from "@/server/today/time";

/**
 * The Today h1 (PLAN §4.1.15): the inputs of lib/day-summary buildDaySummary from what the server loaded, in
 * America/New_York. Anything that failed to load is simply absent (a missing schedule → hasSchedule false), so the
 * headline never fails and never claims more than the panels below show.
 *
 * - classes: today's meetings from the day schedule; `noClasses` its `empty` reason, with the break's name.
 * - deadlines: the student's own, plus the calendar's student-facing deadline rows for their class year
 *   (audienceIncludes) in the next DEADLINE_WINDOW_DAYS days; all-day rows say no time.
 * - milestones: calendar rows that open today (WebTree opens), from server/today/calendar milestonesOn.
 * - events: timed campus events today (only while FEATURE_EVENTS is on; the caller passes none otherwise).
 */

export interface SummaryParts {
  now: Date;
  onboarded: boolean;
  standing: ClassStanding | null;
  /** Null when the schedule could not be loaded. */
  schedule: Pick<DaySchedule, "entries" | "empty" | "termCode"> | null;
  termLabel: string | null;
  studentDeadlines: readonly StudentDeadline[];
  feedItems: readonly FeedItem[];
}

export function summaryInput(parts: SummaryParts): DaySummaryInput {
  const today = etDay(parts.now);
  const rows = calendarDeadlineRows(
    today,
    addDaysToKey(today, DEADLINE_WINDOW_DAYS),
    parts.standing,
  );
  const deadlines: SummaryDeadline[] = [
    ...parts.studentDeadlines.map((deadline) => ({
      title: deadline.title,
      due: new Date(deadline.dueAt),
      ...(deadline.courseCode ? { courseCode: deadline.courseCode } : {}),
    })),
    ...rows.map((row) => ({
      title: row.title,
      due: zonedInstant(row.start, row.time ?? "12:00"),
      ...(row.time ? {} : { allDay: true }),
    })),
  ];
  const breakToday = parts.schedule?.empty === "break" ? breakOn(today) : null;
  return {
    now: parts.now,
    timeZone: TODAY_TIME_ZONE,
    hasSchedule: parts.schedule !== null,
    onboarded: parts.onboarded,
    noClasses: parts.schedule?.empty ?? null,
    ...(breakToday ? { breakName: breakToday.name } : {}),
    ...(parts.termLabel ? { termLabel: parts.termLabel } : {}),
    classes: (parts.schedule?.entries ?? []).map((entry) => ({
      code: entry.courseCode,
      start: new Date(entry.startsAt),
      end: new Date(entry.endsAt),
    })),
    deadlines,
    events: parts.feedItems
      .filter((item) => item.kind === "event" && !item.allDay && item.startsAt)
      .map((item) => ({ title: item.title, start: new Date(item.startsAt as string) })),
    milestones: milestonesOn(today),
  };
}

export function todaySummary(parts: SummaryParts): DaySummary {
  return buildDaySummary(summaryInput(parts));
}
