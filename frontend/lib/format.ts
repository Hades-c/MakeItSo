/**
 * Date and time formatting shared by server and client. Every function takes an explicit IANA time zone
 * (default America/New_York, Davidson's), so a server running in UTC and a browser anywhere render the same text
 * and hydration never disagrees. Server code passes getEnv().APP_TIMEZONE.
 */

export const DEFAULT_TIME_ZONE = "America/New_York";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    formatters.set(key, f);
  }
  return f;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Calendar day in the given zone as YYYY-MM-DD (for "is it today?" comparisons). */
export function dayKey(value: Date | string | number, timeZone = DEFAULT_TIME_ZONE): string {
  const parts = formatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(toDate(value));
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

/** Whole calendar days from `from` to `to` in the zone (0 = same day, 1 = tomorrow, -1 = yesterday). */
export function calendarDaysBetween(
  from: Date | string | number,
  to: Date | string | number,
  timeZone = DEFAULT_TIME_ZONE,
): number {
  const a = Date.parse(`${dayKey(from, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(to, timeZone)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "9:05 AM", "12:00 PM". */
export function formatTime(value: Date | string | number, timeZone = DEFAULT_TIME_ZONE): string {
  return formatter(timeZone, { hour: "numeric", minute: "2-digit" }).format(toDate(value));
}

/** Registrar-ledger clock used in mono metadata: "9:05a", "12:00p", "11:59p". */
export function formatClock(value: Date | string | number, timeZone = DEFAULT_TIME_ZONE): string {
  const parts = formatter(timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(toDate(value));
  const period = part(parts, "dayPeriod").toLowerCase().startsWith("p") ? "p" : "a";
  return `${part(parts, "hour")}:${part(parts, "minute")}${period}`;
}

/** "Wednesday, September 30". */
export function formatLongDate(
  value: Date | string | number,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return formatter(timeZone, { weekday: "long", month: "long", day: "numeric" }).format(
    toDate(value),
  );
}

/** "Sep 30". */
export function formatShortDate(
  value: Date | string | number,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return formatter(timeZone, { month: "short", day: "numeric" }).format(toDate(value));
}

/** "Sep 30, 2026". */
export function formatMediumDate(
  value: Date | string | number,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return formatter(timeZone, { month: "short", day: "numeric", year: "numeric" }).format(
    toDate(value),
  );
}

/** "Thursday". */
export function formatWeekday(value: Date | string | number, timeZone = DEFAULT_TIME_ZONE): string {
  return formatter(timeZone, { weekday: "long" }).format(toDate(value));
}

/** "Sep 30, 9:05 AM": the "as of" time on source tags. */
export function formatAsOf(value: Date | string | number, timeZone = DEFAULT_TIME_ZONE): string {
  return `${formatShortDate(value, timeZone)}, ${formatTime(value, timeZone)}`;
}

/**
 * Compact last-sync label for the Sources panel: the clock time when the sync happened today ("9:05a"), else the
 * date ("Sep 29"). `null` means the source has never synced.
 */
export function formatSyncTime(
  lastSync: Date | string | number | null,
  now: Date | string | number,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  if (lastSync === null) return "never";
  const date = toDate(lastSync);
  if (Number.isNaN(date.getTime())) return "never";
  return dayKey(date, timeZone) === dayKey(now, timeZone)
    ? formatClock(date, timeZone)
    : formatShortDate(date, timeZone);
}

/**
 * Wall-clock minutes since midnight in the zone (9:12 AM → 552): how the day timeline places "now". During the
 * repeated hour when DST ends both 1:30 AMs read 90, matching how the schedule prints times.
 */
export function wallClockMinutes(
  value: Date | string | number,
  timeZone = DEFAULT_TIME_ZONE,
): number {
  const parts = formatter(timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(toDate(value));
  return Number(part(parts, "hour")) * 60 + Number(part(parts, "minute"));
}
