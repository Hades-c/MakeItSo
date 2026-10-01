import { dayKey, formatLongDate, formatShortDate, formatTime, formatWeekday } from "@/lib/format";
import type { FeedItem } from "@/lib/types/feeds";
import { addDaysToKey } from "./range";

/**
 * How /events lays out feed items (PLAN §5 "Dates/times"): grouped by America/New_York calendar day, with
 * all-day items and deadlines rendered as such. Pure and isomorphic: every function takes the zone explicitly,
 * so the server's "today" and the text never depend on where the code runs.
 *
 *   - An item goes under the day it starts; items that started on an earlier day and are still running (a
 *     scholarship window since July, a weekend-long workshop) go in an "Ongoing" group first.
 *   - All-day items: startsAt is midnight ET of the first day and endsAt midnight after the last day.
 *   - Deadlines: kind "deadline", or any timed item that lasts one minute or less (ICS deadlines are 1-minute
 *     events); they show "Due <time>".
 */

export interface EventGroup {
  /** "ongoing" or the "YYYY-MM-DD" day. */
  key: string;
  kind: "ongoing" | "day";
  /** "Ongoing", "Today", "Tomorrow" or the weekday + date ("Friday, October 2"). */
  title: string;
  /** Extra words after the title ("Wednesday, September 30" under Today, "Started before today"). */
  detail: string | null;
  items: FeedItem[];
}

export interface PresentOptions {
  now: Date;
  timeZone: string;
}

const DEADLINE_MAX_MS = 60_000;

export function isDeadlineItem(item: Pick<FeedItem, "kind" | "startsAt" | "endsAt" | "allDay">) {
  if (item.kind === "deadline") return true;
  if (item.allDay || !item.startsAt || !item.endsAt) return false;
  return Date.parse(item.endsAt) - Date.parse(item.startsAt) <= DEADLINE_MAX_MS;
}

/** The calendar day the item starts on in the zone (null for undated items). */
export function startDay(item: Pick<FeedItem, "startsAt">, timeZone: string): string | null {
  return item.startsAt ? dayKey(item.startsAt, timeZone) : null;
}

/**
 * The last calendar day the item runs on: all-day and midnight-ending items end at the midnight AFTER their last
 * day, so one millisecond earlier is the last day. Null without an end.
 */
export function lastDay(
  item: Pick<FeedItem, "startsAt" | "endsAt">,
  timeZone: string,
): string | null {
  if (!item.endsAt) return null;
  const end = Date.parse(item.endsAt);
  const start = item.startsAt ? Date.parse(item.startsAt) : end;
  return dayKey(new Date(Math.max(start, end - 1)), timeZone);
}

/** A calendar day's own name ("Friday, October 2"): read at noon UTC, which is that date in UTC itself. */
function dayName(day: string): string {
  return formatLongDate(new Date(`${day}T12:00:00Z`), "UTC");
}

function dayTitle(day: string, today: string): Pick<EventGroup, "title" | "detail"> {
  if (day === today) return { title: "Today", detail: dayName(day) };
  if (day === addDaysToKey(today, 1)) return { title: "Tomorrow", detail: dayName(day) };
  return { title: dayName(day), detail: null };
}

/** Group items (already sorted soonest first) by start day, with the Ongoing group first. */
export function groupEvents(items: readonly FeedItem[], { now, timeZone }: PresentOptions) {
  const today = dayKey(now, timeZone);
  const ongoing: FeedItem[] = [];
  const byDay = new Map<string, FeedItem[]>();
  for (const item of items) {
    const day = startDay(item, timeZone);
    if (!day) continue;
    if (day < today) {
      // One entry per series: a feed that repeats a session with the series' end (WildcatSync) is not listed
      // as the same ongoing event three times.
      const repeat = ongoing.some(
        (other) =>
          other.title.toLowerCase() === item.title.toLowerCase() && other.endsAt === item.endsAt,
      );
      if (!repeat) ongoing.push(item);
      continue;
    }
    const list = byDay.get(day);
    if (list) list.push(item);
    else byDay.set(day, [item]);
  }
  const groups: EventGroup[] = [];
  if (ongoing.length > 0) {
    groups.push({
      key: "ongoing",
      kind: "ongoing",
      title: "Ongoing",
      detail: "Started before today",
      items: ongoing,
    });
  }
  for (const day of [...byDay.keys()].sort()) {
    groups.push({
      key: day,
      kind: "day",
      ...dayTitle(day, today),
      items: byDay.get(day) ?? [],
    });
  }
  return groups;
}

function dateAndTime(value: string, timeZone: string): string {
  return `${formatShortDate(value, timeZone)}, ${formatTime(value, timeZone)}`;
}

/**
 * The time line of an item, relative to the group it is shown in:
 *   "All day", "All day, through Oct 2", "Due 3:00 PM", "3:00 PM – 5:00 PM", "7:00 PM",
 *   "Oct 2, 4:00 PM – Oct 4, 8:00 PM" (runs over several days),
 *   "Since Jul 23 · until Oct 1, 12:00 PM" (Ongoing).
 */
export function eventTimeLabel(item: FeedItem, { now, timeZone }: PresentOptions): string {
  if (!item.startsAt) return "";
  const today = dayKey(now, timeZone);
  const first = dayKey(item.startsAt, timeZone);
  const last = lastDay(item, timeZone) ?? first;

  if (first < today) {
    const since = `Since ${formatShortDate(item.startsAt, timeZone)}`;
    if (!item.endsAt) return since;
    if (item.allDay) {
      return last === today
        ? `${since} · through today`
        : `${since} · through ${formatShortDate(`${last}T12:00:00Z`, "UTC")}`;
    }
    // An end at exactly midnight counts for the day before it (lastDay), so "until 12:00 AM today" would name the
    // midnight that already passed this morning.
    const endsAtMidnight = dayKey(item.endsAt, timeZone) > last;
    return last === today
      ? endsAtMidnight
        ? `${since} · until midnight tonight`
        : `${since} · until ${formatTime(item.endsAt, timeZone)} today`
      : `${since} · until ${dateAndTime(item.endsAt, timeZone)}`;
  }

  if (item.allDay) {
    return last > first
      ? `All day, through ${formatShortDate(`${last}T12:00:00Z`, "UTC")}`
      : "All day";
  }
  if (isDeadlineItem(item)) return `Due ${formatTime(item.startsAt, timeZone)}`;
  if (!item.endsAt) return formatTime(item.startsAt, timeZone);
  if (last > first) {
    return `${dateAndTime(item.startsAt, timeZone)} – ${dateAndTime(item.endsAt, timeZone)}`;
  }
  return `${formatTime(item.startsAt, timeZone)} – ${formatTime(item.endsAt, timeZone)}`;
}

/** "Sunday, Oct 4": the last day a window covers, for the results summary. */
export function windowEndLabel(day: string): string {
  const noonUtc = new Date(`${day}T12:00:00Z`);
  return `${formatWeekday(noonUtc, "UTC")}, ${formatShortDate(noonUtc, "UTC")}`;
}
