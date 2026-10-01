import "server-only";
import { dayKey, DEFAULT_TIME_ZONE, wallClockMinutes } from "@/lib/format";
import { addDaysToKey, isDateKey, weekdayOf, zonedInstant } from "@/server/plan/time";

/**
 * America/New_York calendar helpers for Today (PLAN §5 "Dates/times": every "today/now" decision is made in ET on
 * the server). The DST-correct date arithmetic is the plan service's (server/plan/time.ts), re-used here so the
 * timeline and the day schedule can never disagree about an instant.
 */

export { addDaysToKey, isDateKey, weekdayOf, zonedInstant };

export const TODAY_TIME_ZONE = DEFAULT_TIME_ZONE;

/** The Davidson date of an instant. */
export function etDay(at: Date | string): string {
  return dayKey(at, TODAY_TIME_ZONE);
}

/** [start, end) of a Davidson day as instants (23 or 25 hours long on DST days). */
export function dayBounds(day: string): { start: Date; end: Date } {
  return { start: zonedInstant(day, "00:00"), end: zonedInstant(addDaysToKey(day, 1), "00:00") };
}

/** "HH:MM" ET wall clock of an instant (the timeline's item times). */
export function etClock(at: Date | string): string {
  const minutes = wallClockMinutes(at, TODAY_TIME_ZONE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The five days the week strip shows: Monday to Friday of this week, or of next week on a weekend (the school week
 * ahead).
 */
export function stripDays(today: string): string[] {
  const offset: Record<string, number> = { M: 0, T: -1, W: -2, R: -3, F: -4, S: 2, U: 1 };
  const monday = addDaysToKey(today, offset[weekdayOf(today)] ?? 0);
  return [0, 1, 2, 3, 4].map((i) => addDaysToKey(monday, i));
}
