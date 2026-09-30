/**
 * Meeting days as the Davidson schedule writes them (PLAN §4.1: Meeting.days), with display names. Pure: safe to
 * import from server and client components alike.
 */

export const WEEK_DAYS = ["M", "T", "W", "R", "F", "S", "U"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Monday to Friday: the default columns of a week grid. */
export const WEEKDAYS_ONLY: readonly WeekDay[] = ["M", "T", "W", "R", "F"];

export const DAY_NAMES: Readonly<Record<WeekDay, { short: string; long: string }>> = {
  M: { short: "Mon", long: "Monday" },
  T: { short: "Tue", long: "Tuesday" },
  W: { short: "Wed", long: "Wednesday" },
  R: { short: "Thu", long: "Thursday" },
  F: { short: "Fri", long: "Friday" },
  S: { short: "Sat", long: "Saturday" },
  U: { short: "Sun", long: "Sunday" },
};

/** Days in calendar order, without duplicates. */
export function sortDays(days: Iterable<WeekDay>): WeekDay[] {
  const set = new Set(days);
  return WEEK_DAYS.filter((d) => set.has(d));
}

/** "Tue, Thu" / "Mon, Wed, Fri". */
export function joinDayNames(days: Iterable<WeekDay>): string {
  return sortDays(days)
    .map((d) => DAY_NAMES[d].short)
    .join(", ");
}
