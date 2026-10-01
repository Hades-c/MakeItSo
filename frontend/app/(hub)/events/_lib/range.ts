import { dayKey } from "@/lib/format";

/**
 * The /events date presets (PLAN §3 /events, §5 "Dates/times"): every boundary is an America/New_York calendar
 * day (the zone comes from APP_TIMEZONE), computed on the server from `now()`. Pure and isomorphic.
 *
 *   today  now → midnight at the end of today
 *   week   now → midnight at the end of this Sunday (weeks run Monday–Sunday, so on a Sunday it is just today)
 *   14d    now → midnight at the end of the 14th day, today included (the feed service's default window)
 *
 * Windows start at `now`, not at midnight: what already ended today is gone, and an event still running (it
 * started earlier) overlaps the window and is listed.
 */

export const EVENT_RANGES = ["today", "week", "14d"] as const;
export type EventRange = (typeof EVENT_RANGES)[number];
export const DEFAULT_EVENT_RANGE: EventRange = "14d";

export const EVENT_RANGE_LABELS: Readonly<Record<EventRange, string>> = {
  today: "Today",
  week: "This week",
  "14d": "Next 14 days",
};

export function isEventRange(value: unknown): value is EventRange {
  return typeof value === "string" && (EVENT_RANGES as readonly string[]).includes(value);
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDayKey(day: string): { year: number; month: number; date: number } {
  const match = DAY_KEY.exec(day);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD day: ${JSON.stringify(day)}`);
  return { year: Number(match[1]), month: Number(match[2]), date: Number(match[3]) };
}

/** Calendar arithmetic on "YYYY-MM-DD" keys (no time zone involved): addDaysToKey("2026-09-30", 2) = "2026-10-02". */
export function addDaysToKey(day: string, days: number): string {
  const { year, month, date } = parseDayKey(day);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** ISO weekday of a day key: Monday 1 … Sunday 7. */
export function isoWeekday(day: string): number {
  const { year, month, date } = parseDayKey(day);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Wall clock minus UTC, in ms, of `timeZone` at the instant `utcMs` (-4 h during EDT). */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The instant the wall clock in `timeZone` reads 00:00 on `day`. Offsets are re-checked once, so a day that
 * starts in a different offset from the one at UTC midnight (DST changes happen at 2 AM in New York, so midnight
 * itself always exists there) still lands on local midnight.
 */
export function startOfDayInZone(day: string, timeZone: string): Date {
  const { year, month, date } = parseDayKey(day);
  const wallMs = Date.UTC(year, month - 1, date);
  const first = wallMs - zoneOffsetMs(wallMs, timeZone);
  const second = wallMs - zoneOffsetMs(first, timeZone);
  return new Date(second);
}

export interface EventsWindow {
  range: EventRange;
  from: Date;
  to: Date;
  /** Today's calendar day in the zone ("YYYY-MM-DD"). */
  today: string;
  /** The last calendar day the window covers. */
  lastDay: string;
}

/** The [from, to) window of a preset at `now` in `timeZone` (see the module comment). */
export function rangeWindow(range: EventRange, now: Date, timeZone: string): EventsWindow {
  const today = dayKey(now, timeZone);
  const daysAfterToday = range === "today" ? 1 : range === "week" ? 8 - isoWeekday(today) : 14;
  const end = addDaysToKey(today, daysAfterToday);
  return {
    range,
    from: now,
    to: startOfDayInZone(end, timeZone),
    today,
    lastDay: addDaysToKey(end, -1),
  };
}
