import "server-only";
import { z } from "zod";
import type { LibraryLocationHours } from "@/lib/types/feeds";
import { cleanLine, oneLine } from "@/server/feeds/text";
import {
  addDaysToKey,
  parseDateKey,
  startOfDayInZone,
  weekdayOfKey,
  zonedTimeToUtc,
} from "@/server/feeds/time";
import type { NormalizedFeedItem, ParseContext } from "@/server/feeds/types";

/**
 * LibCal "hours today" (davidson.libcal.com/api_hours_today.php, an undocumented widget endpoint: see
 * content-prep links → feeds). One entry per location; `times.status` is open (with `hours` ranges), 24hours,
 * text ("Closed for Renovation", "CatCard Access Only"), closed or not-set (blank ≠ closed). Stored as kind
 * "hours" items (one per location per America/New_York date) and served by getLibraryHours(date).
 */

export const LIBRARY_HOURS_PAGE = "https://davidson.libcal.com/hours";

const Id = z.union([z.number().int(), z.string().min(1)]).transform(String);

export const LibCalLocationSchema = z.looseObject({
  lid: Id,
  name: z.string(),
  parent_lid: Id.optional(),
  day: z.string().optional(),
  times: z
    .looseObject({
      status: z.string().optional(),
      text: z.string().optional(),
      hours: z.array(z.looseObject({ from: z.string(), to: z.string() })).optional(),
    })
    .optional(),
  rendered: z.string().optional(),
});

export const LibCalHoursTodaySchema = z.looseObject({
  locations: z.array(LibCalLocationSchema),
});
export type LibCalHoursToday = z.infer<typeof LibCalHoursTodaySchema>;

const STATUSES = ["open", "closed", "24hours", "text", "not-set"] as const;
type HoursStatus = LibraryLocationHours["status"];

/** "7am", "11:59pm", "7:30 AM", "12pm", "noon", "midnight" → minutes after midnight, or null. */
export function parseClock(value: string): number | null {
  const text = value.trim().toLowerCase().replace(/\./g, "");
  if (text === "noon") return 12 * 60;
  if (text === "midnight") return 0;
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])m?$/.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = match[3] === "p";
  if (hour === 12) hour = pm ? 12 : 0;
  else if (pm) hour += 12;
  return hour * 60 + minute;
}

function atMinutes(key: string, minutes: number, timeZone: string): Date {
  const { year, month, day } = parseDateKey(key);
  return zonedTimeToUtc(
    { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    timeZone,
  );
}

/**
 * The date LibCal meant by "today": the ET date of `now`, unless LibCal's weekday says it is still (or already)
 * the neighbouring day around midnight.
 */
export function libCalDate(data: LibCalHoursToday, todayKey: string): string {
  const weekday = data.locations
    .find((l) => l.day)
    ?.day?.trim()
    .toLowerCase();
  if (!weekday) return todayKey;
  for (const key of [todayKey, addDaysToKey(todayKey, -1), addDaysToKey(todayKey, 1)]) {
    if (weekdayOfKey(key).toLowerCase() === weekday) return key;
  }
  return todayKey;
}

/** One location's hours on `date` (America/New_York). */
export function normalizeLocationHours(
  location: z.infer<typeof LibCalLocationSchema>,
  date: string,
  timeZone: string,
): LibraryLocationHours {
  const rawStatus = location.times?.status?.trim().toLowerCase() ?? "";
  const text = cleanLine(location.rendered ?? location.times?.text ?? "", 200);
  let status: HoursStatus = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as HoursStatus)
    : text
      ? "text"
      : "not-set";
  let opensAt: string | null = null;
  let closesAt: string | null = null;
  if (status === "24hours") {
    opensAt = startOfDayInZone(date, timeZone).toISOString();
    closesAt = startOfDayInZone(addDaysToKey(date, 1), timeZone).toISOString();
  } else if (status === "open") {
    const ranges = (location.times?.hours ?? [])
      .map((range) => ({ from: parseClock(range.from), to: parseClock(range.to) }))
      .filter((r): r is { from: number; to: number } => r.from !== null && r.to !== null);
    const first = ranges[0];
    const last = ranges[ranges.length - 1];
    if (first && last) {
      const opens = atMinutes(date, first.from, timeZone);
      // "8am - 2am": a closing time at or before the opening time is after midnight.
      const closeDay = last.to <= first.from ? addDaysToKey(date, 1) : date;
      opensAt = opens.toISOString();
      closesAt = atMinutes(closeDay, last.to, timeZone).toISOString();
    } else if (!text) {
      status = "not-set";
    }
  }
  return {
    id: location.lid,
    name: oneLine(location.name) || `Location ${location.lid}`,
    status,
    text,
    opensAt,
    closesAt,
  };
}

/** Every location of the "hours today" payload as kind "hours" items for `date`. */
export function normalizeLibraryHours(
  data: LibCalHoursToday,
  context: ParseContext & { date: string },
): NormalizedFeedItem[] {
  const { source, channel, date, timeZone } = context;
  const dayStart = startOfDayInZone(date, timeZone);
  const dayEnd = startOfDayInZone(addDaysToKey(date, 1), timeZone);
  return data.locations.map((location, order) => {
    const hours = normalizeLocationHours(location, date, timeZone);
    const opens = hours.opensAt ? new Date(hours.opensAt) : null;
    const closes = hours.closesAt ? new Date(hours.closesAt) : null;
    return {
      source,
      channel,
      externalId: `hours:${hours.id}@${date}`,
      kind: "hours" as const,
      title: cleanLine(hours.name, 300) || `Location ${hours.id}`,
      url: LIBRARY_HOURS_PAGE,
      startsAt: opens ?? dayStart,
      endsAt: closes ?? dayEnd,
      allDay: !(opens && closes) || hours.status === "24hours",
      location: null,
      summaryText: hours.text || null,
      hours: { date, locationId: hours.id, status: hours.status, text: hours.text, order },
    };
  });
}
