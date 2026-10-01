import "server-only";
import type { FiveDayStripDay } from "@/components/domain/five-day-strip";
import type { ClassStanding } from "@/lib/term";
import type { DaySchedule, StudentDeadline } from "@/lib/types/plan";
import { formatTime } from "@/lib/format";
import type { ContentDeadline } from "@/server/content/academic-calendar";
import { dayContentDeadlines } from "@/server/today/agenda";
import { addDaysToKey, etDay, mondayOf } from "@/server/today/time";

/**
 * The five-day strip (Lakeside Today header): Monday to Friday of the school week with, per day, the number of
 * classes and deadlines that day's timeline lists (the student's own and the curated ones for their class year). Campus events are left out of
 * the count: a busy campus would fill every pill with dots that say nothing about the student's day. Pure.
 */

export const STRIP_NOUN = ["class or deadline", "classes and deadlines"] as const;

export interface StripDayInput {
  day: string;
  /** Null when that day's schedule could not be loaded (its classes then count 0). */
  schedule: Pick<DaySchedule, "entries"> | null;
}

/**
 * Classes + deadlines of a strip day, exactly what that day's timeline lists: its class meetings, the student's own
 * deadlines and the curated deadlines of the day for them (dayContentDeadlines, timed or all day).
 */
export function stripCount(
  input: StripDayInput,
  studentDeadlines: readonly StudentDeadline[],
  contentDeadlines: readonly ContentDeadline[],
  standing: ClassStanding | null,
): number {
  const classes = new Set((input.schedule?.entries ?? []).map((e) => `${e.crn} ${e.start}`)).size;
  const own = studentDeadlines.filter((deadline) => etDay(deadline.dueAt) === input.day).length;
  const curated = dayContentDeadlines(input.day, contentDeadlines, standing).length;
  return classes + own + curated;
}

const SHORT_WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * When the next class day's first class is, said from the real today (never from the strip day shown):
 * "Tomorrow 9:40 AM"; "Fri 9:40 AM" later this week (Monday to Sunday); "Mon, Oct 5 9:40 AM" in a later week.
 * Null for a day that is not after today.
 */
export function nextUpLabel(
  day: string,
  today: string,
  startsAt: string,
  timeZone: string,
): string | null {
  if (day <= today) return null;
  const time = formatTime(startsAt, timeZone);
  if (day === addDaysToKey(today, 1)) return `Tomorrow ${time}`;
  const date = new Date(`${day}T12:00:00Z`);
  if (mondayOf(day) === mondayOf(today)) return `${SHORT_WEEKDAY.format(date)} ${time}`;
  return `${SHORT_DATE.format(date)} ${time}`;
}

export function stripDay(
  input: StripDayInput,
  options: {
    today: string;
    selected: string;
    count: number;
    href: (day: string) => string;
  },
): FiveDayStripDay {
  return {
    date: input.day,
    label: SHORT_WEEKDAY.format(new Date(`${input.day}T12:00:00Z`)),
    count: options.count,
    isToday: input.day === options.today,
    href: options.href(input.day),
    ...(options.selected !== options.today && input.day === options.selected
      ? { selected: true }
      : {}),
  };
}
