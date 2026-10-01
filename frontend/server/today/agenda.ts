import "server-only";
import type { TimelineItem } from "@/components/domain/day-timeline";
import { itemInterval } from "@/components/domain/timeline-layout";
import { MINUTES_PER_HOUR, windowForItems } from "@/components/domain/time-geometry";
import type { FeedItem } from "@/lib/types/feeds";
import type { DaySchedule, DayScheduleEntry, StudentDeadline } from "@/lib/types/plan";
import type { ContentDeadline } from "@/server/content/academic-calendar";
import { etClock, etDay } from "@/server/today/time";

/**
 * One day of the Today timeline (PLAN §3: classes, feed events, deadlines, a now-line in ET, free gaps), as the
 * Lakeside DayTimeline draws it. Pure: the loaders (server/today/load.ts) pass the day's schedule, the student's
 * deadlines, the curated deadlines and the feed items.
 *
 * - Classes: every meeting of the day schedule (server/plan getDaySchedule), tagged COURSE SCHEDULE (where the
 *   meeting times come from; the timeline draws classes by course colour, without a tag).
 * - Deadlines: the student's own (YOUR PLAN) due that day, and the curated rows with a published time on that day
 *   (REGISTRAR, office tags): points on the line.
 * - Campus events: timed feed events that start that day and last at most MAX_EVENT_MINUTES (an all-day or
 *   open-ended item has no place on a timeline), at most MAX_TIMELINE_EVENTS of them, the ones still ahead first
 *   on the current day. The rest (still ahead) are counted in `moreEvents` ("2 more campus events today").
 * - The view: 9a–4p, stretched to every item, but never before 7a or past midnight (items outside are listed
 *   under the view by DayTimeline, never dropped).
 */

export const MAX_TIMELINE_EVENTS = 3;
export const MAX_EVENT_MINUTES = 4 * MINUTES_PER_HOUR;
export const DEFAULT_START_HOUR = 9;
export const DEFAULT_END_HOUR = 16;
export const EARLIEST_HOUR = 7;
export const LATEST_HOUR = 24;

export interface AgendaInput {
  day: string;
  schedule: Pick<DaySchedule, "entries">;
  studentDeadlines: readonly StudentDeadline[];
  contentDeadlines: readonly ContentDeadline[];
  feedItems: readonly FeedItem[];
  /** Now, when `day` is today (events already over are then left for the ones ahead). */
  now?: Date;
}

export interface Agenda {
  items: TimelineItem[];
  startHour: number;
  endHour: number;
  /** Timed campus events that day (not over yet, on the current day) left off the timeline. */
  moreEvents: number;
}

/** "Watson Life Sciences Building 132". */
export function meetingLocation(entry: Pick<DayScheduleEntry, "building" | "room">) {
  return [entry.building, entry.room].filter(Boolean).join(" ") || undefined;
}

function classItems(entries: readonly DayScheduleEntry[]): TimelineItem[] {
  return entries.map((entry) => ({
    id: `class-${entry.crn}-${entry.start}`,
    kind: "class",
    code: entry.courseCode,
    title: entry.title,
    start: entry.start,
    end: entry.end,
    location: meetingLocation(entry),
    source: "course-schedule",
    ...(entry.kind === "lab" ? { detail: "Lab" } : {}),
  }));
}

function studentDeadlineItems(day: string, deadlines: readonly StudentDeadline[]): TimelineItem[] {
  return deadlines
    .filter((deadline) => etDay(deadline.dueAt) === day)
    .map((deadline) => ({
      id: `deadline-${deadline.id}`,
      kind: "deadline",
      title: deadline.title,
      start: etClock(deadline.dueAt),
      source: "my-plan",
      ...(deadline.courseCode ? { code: deadline.courseCode } : {}),
    }));
}

function contentDeadlineItems(day: string, deadlines: readonly ContentDeadline[]): TimelineItem[] {
  return deadlines
    .filter((deadline) => deadline.date === day && deadline.time)
    .map((deadline) => ({
      id: `content-${deadline.id}`,
      kind: "deadline",
      title: deadline.label ? `${deadline.title}: ${deadline.label}` : deadline.title,
      start: deadline.time as string,
      source: deadline.source,
    }));
}

/** Timed feed items that start on `day` and fit a timeline (≤ MAX_EVENT_MINUTES; events ≤ 1 minute are deadlines). */
export function timedFeedItems(day: string, items: readonly FeedItem[]): FeedItem[] {
  return items
    .filter((item) => {
      if (item.allDay || !item.startsAt || etDay(item.startsAt) !== day) return false;
      if (item.kind !== "event" && item.kind !== "deadline") return false;
      if (item.kind === "deadline") return true;
      if (!item.endsAt) return false;
      const minutes = (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60_000;
      return minutes > 0 && minutes <= MAX_EVENT_MINUTES;
    })
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!) || a.id.localeCompare(b.id));
}

function feedItem(item: FeedItem): TimelineItem {
  const isDeadline = item.kind === "deadline";
  const startsAt = item.startsAt as string;
  return {
    id: `feed-${item.id}`,
    kind: isDeadline ? "deadline" : "event",
    title: item.title,
    start: etClock(startsAt),
    ...(isDeadline || !item.endsAt ? {} : { end: etClock(item.endsAt) }),
    ...(item.location ? { location: item.location } : {}),
    source: item.source,
  };
}

/**
 * The events the timeline shows (at most MAX_TIMELINE_EVENTS) and how many more there are: on the current day
 * only those not over yet count.
 */
export function pickTimelineEvents(
  day: string,
  items: readonly FeedItem[],
  now?: Date,
): { shown: FeedItem[]; more: number } {
  let pool = timedFeedItems(day, items);
  if (now && etDay(now) === day) {
    const t = now.getTime();
    pool = pool.filter((item) => Date.parse(item.endsAt ?? item.startsAt!) > t);
  }
  const shown = pool.slice(0, MAX_TIMELINE_EVENTS);
  return { shown, more: pool.length - shown.length };
}

/** Whole hours shown: 9a–4p stretched to the items, within [7a, midnight]. */
export function agendaWindow(items: readonly TimelineItem[]): {
  startHour: number;
  endHour: number;
} {
  const spans = items.flatMap((item) => {
    const span = itemInterval(item);
    return span ? [{ start: span.start, end: span.end }] : [];
  });
  const window = windowForItems(spans, DEFAULT_START_HOUR, DEFAULT_END_HOUR);
  const startHour = Math.max(EARLIEST_HOUR, Math.floor(window.start / MINUTES_PER_HOUR));
  const endHour = Math.min(LATEST_HOUR, Math.ceil(window.end / MINUTES_PER_HOUR));
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}

export function buildAgenda(input: AgendaInput): Agenda {
  const events = pickTimelineEvents(input.day, input.feedItems, input.now);
  const items = [
    ...classItems(input.schedule.entries),
    ...studentDeadlineItems(input.day, input.studentDeadlines),
    ...contentDeadlineItems(input.day, input.contentDeadlines),
    ...events.shown.map(feedItem),
  ];
  return { items, ...agendaWindow(items), moreEvents: events.more };
}
