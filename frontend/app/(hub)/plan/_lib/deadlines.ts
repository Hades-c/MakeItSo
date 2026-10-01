import { dayKey, DEFAULT_TIME_ZONE, wallClockMinutes } from "@/lib/format";
import type { SourceId } from "@/lib/sources";
import { clockText } from "./week";

/**
 * Registration deadlines for the Next semester tab (PLAN §5: "Deadlines come from the academic calendar"). The
 * rows come from server/plan's WebTree report (server/content academic calendar, tag REGISTRAR); this module
 * words their dates and says where today falls, in Davidson time (America/New_York), on the server. Pure.
 */

/** The fields of a calendar deadline this tab shows (server/content ContentDeadline). */
export interface DeadlineInput {
  id: string;
  title: string;
  /** Davidson day ("YYYY-MM-DD"); a window's first day. */
  date: string;
  /** Last day of a multi-day window. */
  endDate: string | null;
  /** Published 24 h ET time ("07:00"). */
  time: string | null;
  source: SourceId;
  url: string;
}

export type DeadlineState = "upcoming" | "open" | "past";

export interface DeadlineView {
  id: string;
  title: string;
  /** "Mon, Oct 12, 7:00a – Tue, Nov 3" / "Tue, Nov 3, 5:00p". */
  when: string;
  /** Machine date for <time dateTime>. */
  dateTime: string;
  state: DeadlineState;
  /** "In 12 days", "Tomorrow", "Today", "Open now", "Passed". */
  relative: string;
  source: SourceId;
  url: string;
}

/** "Mon, Oct 12" for a Davidson day key, without any zone shift. */
export function dayText(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function minutesOf(time: string | null, fallback: number): number {
  const match = time ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

/** Compare (day, minute) pairs. */
function compare(a: [string, number], b: [string, number]): number {
  return a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1;
}

/** Whole days between two Davidson day keys. */
function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function relativeDays(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/**
 * One row worded for `now`. A window is open from its first day's time until `endTime` on its last day (the
 * closing deadline's published time, see describeDeadlines), or through the end of that day when none is known.
 */
export function describeDeadline(
  deadline: DeadlineInput,
  now: Date,
  timeZone = DEFAULT_TIME_ZONE,
  endTime: string | null = null,
): DeadlineView {
  const today: [string, number] = [dayKey(now, timeZone), wallClockMinutes(now, timeZone)];
  const start: [string, number] = [deadline.date, minutesOf(deadline.time, 0)];
  const end: [string, number] = deadline.endDate
    ? [deadline.endDate, minutesOf(endTime, 24 * 60)]
    : [deadline.date, minutesOf(deadline.time, 24 * 60)];
  const startText = `${dayText(deadline.date)}${deadline.time ? `, ${clockText(deadline.time)}` : ""}`;
  const endText = deadline.endDate
    ? `${dayText(deadline.endDate)}${endTime ? `, ${clockText(endTime)}` : ""}`
    : "";
  const when = deadline.endDate ? `${startText} – ${endText}` : startText;

  let state: DeadlineState;
  let relative: string;
  if (compare(today, start) < 0) {
    state = "upcoming";
    relative = relativeDays(daysFrom(today[0], deadline.date));
  } else if (compare(today, end) < 0 && deadline.endDate) {
    state = "open";
    relative = "Open now";
  } else if (compare(today, end) < 0) {
    state = "upcoming";
    relative = "Today";
  } else {
    state = "past";
    relative = "Passed";
  }
  return {
    id: deadline.id,
    title: deadline.title,
    when,
    dateTime: deadline.time ? `${deadline.date}T${deadline.time}` : deadline.date,
    state,
    relative,
    source: deadline.source,
    url: deadline.url,
  };
}

/**
 * Every row worded for `now`, each window ending at the time of the single deadline that closes it: a timed row
 * from the same source on the window's last day (WebTree Oct 12 – Nov 3 closes with "WebTree Closes", 5:00p;
 * November add/drop with "Add/Drop Ends", 5:00p). The calendar gives a window no end time of its own.
 */
export function describeDeadlines(
  deadlines: readonly DeadlineInput[],
  now: Date,
  timeZone = DEFAULT_TIME_ZONE,
): DeadlineView[] {
  return deadlines.map((deadline) => {
    const closing = deadline.endDate
      ? deadlines.find(
          (other) =>
            other.id !== deadline.id &&
            other.endDate === null &&
            other.date === deadline.endDate &&
            other.time !== null &&
            other.source === deadline.source,
        )
      : undefined;
    return describeDeadline(deadline, now, timeZone, closing?.time ?? null);
  });
}
