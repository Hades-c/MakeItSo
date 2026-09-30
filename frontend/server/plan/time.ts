import "server-only";
import { dayKey } from "@/lib/format";
import { TERM_TIME_ZONE } from "@/lib/term";
import type { MeetingDay } from "@/lib/types/catalog";

/**
 * America/New_York calendar helpers for the plan service (PLAN §5 "Dates/times"): class meetings are ET wall-clock
 * times, and a day's timeline needs the absolute instants of those times on one date, DST included (2026-11-01 and
 * 2027-03-14). Pure.
 */

export const PLAN_TIME_ZONE = TERM_TIME_ZONE;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date "YYYY-MM-DD" (2026-02-30 is not). */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const match = DATE_KEY.exec(key);
  if (!match || !isDateKey(key)) throw new RangeError(`Not a date: ${JSON.stringify(key)}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Today's date in America/New_York. */
export function todayKey(at: Date): string {
  return dayKey(at, PLAN_TIME_ZONE);
}

/** `key` plus `days` calendar days. */
export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const WEEKDAY_LETTERS: readonly MeetingDay[] = ["U", "M", "T", "W", "R", "F", "S"];

/** The meeting-day letter of a calendar date (M T W R F S U). */
export function weekdayOf(key: string): MeetingDay {
  const { year, month, day } = parseDateKey(key);
  return WEEKDAY_LETTERS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "U";
}

const WEEKDAY_BY_NAME: Readonly<Record<string, MeetingDay>> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "R",
  friday: "F",
  saturday: "S",
  sunday: "U",
};

/** "Monday" → "M" (case-insensitive); null for anything else. */
export function weekdayByName(name: string): MeetingDay | null {
  return WEEKDAY_BY_NAME[name.toLowerCase()] ?? null;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** The zone's UTC offset at an instant, in minutes (America/New_York: -240 in summer, -300 in winter). */
function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
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
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]),
  );
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((local - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/**
 * The instant of wall-clock `time` ("HH:MM") on `date` in `timeZone`. A time skipped by the spring-forward gap
 * resolves forward (02:30 → 03:30); a repeated time in the fall-back hour resolves to its first occurrence.
 */
export function zonedInstant(date: string, time: string, timeZone = PLAN_TIME_ZONE): Date {
  const { year, month, day } = parseDateKey(date);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new RangeError(`Not a clock time: ${JSON.stringify(time)}`);
  const wall = Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2]));
  // The offset a few hours before the instant: for a repeated fall-back time this lands on its first occurrence.
  const before = zoneOffsetMinutes(wall, timeZone);
  const first = wall - before * 60_000;
  const atFirst = zoneOffsetMinutes(first, timeZone);
  if (atFirst === before) return new Date(first);
  const second = wall - atFirst * 60_000;
  if (zoneOffsetMinutes(second, timeZone) === atFirst) return new Date(second);
  // A time inside the spring-forward gap: resolve forward.
  return new Date(Math.max(first, second));
}
