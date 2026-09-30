import "server-only";
import { dayKey, DEFAULT_TIME_ZONE } from "@/lib/format";

/**
 * Time-zone arithmetic for feed normalisation (PLAN §5 "Dates/times"). Every feed time becomes an absolute
 * instant; wall-clock times (ICS TZID or floating, Tribe local times, LibCal "7am", the Events Digest's
 * "Sep 26, 2026 10:00 am") are read in their IANA zone with Intl, so DST changes (2026-11-01, 2027-03-14) are
 * handled by the platform's time-zone database rather than by hand-written offsets.
 */

/** Davidson's zone: floating ICS times and date-only values are campus wall-clock time. */
export const CAMPUS_TIME_ZONE = DEFAULT_TIME_ZONE;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface WallTime {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
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
  return formatter;
}

/** Offset of `timeZone` at the instant `utcMs`, in ms (wall clock minus UTC; -4 h during EDT). */
export function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` reads `wall`. Like Temporal's "compatible" disambiguation: a
 * repeated time (2026-11-01 01:30 in New York) resolves to the earlier instant (EDT), a skipped time
 * (2027-03-14 02:30) moves forward by the gap (03:30 EDT).
 */
export function zonedTimeToUtc(wall: WallTime, timeZone: string = CAMPUS_TIME_ZONE): Date {
  const wallMs = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
  );
  const first = wallMs - zoneOffsetMs(wallMs, timeZone);
  const firstOffset = zoneOffsetMs(first, timeZone);
  const second = wallMs - firstOffset;
  const secondOffset = zoneOffsetMs(second, timeZone);
  if (firstOffset === secondOffset) return new Date(second);
  // In a DST gap the two guesses disagree: take the later instant (shift forward).
  return new Date(Math.max(wallMs - firstOffset, wallMs - secondOffset));
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const match = DATE_KEY.exec(key);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Calendar date arithmetic on "YYYY-MM-DD" keys (no time zone involved). */
export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Midnight at the start of the calendar day `key` in `timeZone` (a 23 or 25 hour day around DST changes). */
export function startOfDayInZone(key: string, timeZone: string = CAMPUS_TIME_ZONE): Date {
  return zonedTimeToUtc(parseDateKey(key), timeZone);
}

/** "YYYY-MM-DD" of `date` in `timeZone`. */
export function dateKeyInZone(date: Date, timeZone: string = CAMPUS_TIME_ZONE): string {
  return dayKey(date, timeZone);
}

/** English weekday of a "YYYY-MM-DD" key ("Wednesday"). */
export function weekdayOfKey(key: string): string {
  const { year, month, day } = parseDateKey(key);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/**
 * Windows and legacy zone names some calendar producers put in TZID (Outlook, Exchange), mapped to IANA ids.
 * Anything Intl accepts is used as is.
 */
const TZID_ALIASES: Readonly<Record<string, string>> = {
  "eastern standard time": "America/New_York",
  "eastern daylight time": "America/New_York",
  "us eastern standard time": "America/Indiana/Indianapolis",
  "central standard time": "America/Chicago",
  "mountain standard time": "America/Denver",
  "pacific standard time": "America/Los_Angeles",
  "gmt standard time": "Europe/London",
  utc: "UTC",
  gmt: "UTC",
  z: "UTC",
};

function isIanaZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The IANA zone for an ICS TZID, or null when it is unknown. Handles quoted ids, "/mozilla.org/.../Area/City"
 * style prefixes and common Windows names.
 */
export function resolveTimeZone(tzid: string | null | undefined): string | null {
  if (!tzid) return null;
  const cleaned = tzid.trim().replace(/^"|"$/g, "");
  if (!cleaned) return null;
  const alias = TZID_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;
  if (!cleaned.startsWith("/") && isIanaZone(cleaned)) return cleaned;
  // "/mozilla.org/20050126_1/America/New_York", "/softwarestudio.org/Olson_20011030_5/America/New_York"
  const segments = cleaned.split("/").filter(Boolean);
  for (const size of [3, 2]) {
    if (segments.length < size) continue;
    const candidate = segments.slice(-size).join("/");
    if (/^[A-Za-z]/.test(candidate) && isIanaZone(candidate)) return candidate;
  }
  return null;
}
