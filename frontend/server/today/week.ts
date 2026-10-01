import "server-only";
import type { FiveDayStripDay } from "@/components/domain/five-day-strip";
import type { ClassStanding } from "@/lib/term";
import type { DaySchedule, StudentDeadline } from "@/lib/types/plan";
import { calendarDeadlineRows } from "@/server/today/calendar";
import { etDay } from "@/server/today/time";

/**
 * The five-day strip (Lakeside Today header): Monday to Friday of the school week with, per day, the number of
 * classes and deadlines (the student's own and the calendar's for their class year). Campus events are left out of
 * the count: a busy campus would fill every pill with dots that say nothing about the student's day. Pure.
 */

export const STRIP_NOUN = ["class or deadline", "classes and deadlines"] as const;

export interface StripDayInput {
  day: string;
  /** Null when that day's schedule could not be loaded (its classes then count 0). */
  schedule: Pick<DaySchedule, "entries"> | null;
}

export function stripCount(
  input: StripDayInput,
  studentDeadlines: readonly StudentDeadline[],
  standing: ClassStanding | null,
): number {
  const classes = new Set((input.schedule?.entries ?? []).map((e) => `${e.crn} ${e.start}`)).size;
  const own = studentDeadlines.filter((deadline) => etDay(deadline.dueAt) === input.day).length;
  const calendar = calendarDeadlineRows(input.day, input.day, standing).length;
  return classes + own + calendar;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

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
    label: WEEKDAY.format(new Date(`${input.day}T12:00:00Z`)),
    count: options.count,
    isToday: input.day === options.today,
    href: options.href(input.day),
    ...(options.selected !== options.today && input.day === options.selected
      ? { selected: true }
      : {}),
  };
}
