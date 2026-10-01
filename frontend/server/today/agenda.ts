import "server-only";
import type { TimelineItem } from "@/components/domain/day-timeline";
import { itemInterval } from "@/components/domain/timeline-layout";
import { MINUTES_PER_HOUR, windowForItems } from "@/components/domain/time-geometry";
import type { SourceId } from "@/lib/sources";
import type { ClassStanding } from "@/lib/term";
import type { FeedItem } from "@/lib/types/feeds";
import type { DaySchedule, DayScheduleEntry, StudentDeadline } from "@/lib/types/plan";
import type { ContentDeadline } from "@/server/content/academic-calendar";
import { audienceIncludes, calendarCategoryOf } from "@/server/today/calendar";
import { etClock, etDay } from "@/server/today/time";

/**
 * One day of the Today timeline (PLAN §3: classes, feed events, deadlines, a now-line in ET, free gaps), as the
 * Lakeside DayTimeline draws it. Pure: the loaders (server/today/load.ts) pass the day's schedule, the student's
 * deadlines, the curated deadlines and the feed items.
 *
 * - Classes: every meeting of the day schedule (server/plan getDaySchedule), tagged COURSE SCHEDULE (where the
 *   meeting times come from; the timeline draws classes by course colour, without a tag).
 * - Deadlines: the student's own (YOUR PLAN) due that day, and the curated deadline rows of that day for the
 *   student (dayContentDeadlines: REGISTRAR, office tags): points on the line when they have a published time,
 *   else in `allDay` (listed with the timeline). Registration openings are never drawn as deadlines.
 * - Campus events: see pickTimelineEvents (at most MAX_TIMELINE_EVENTS, ≤ 4 h, open-ended = 2 h, never over one
 *   of the student's classes); the rest are counted in `moreEvents`. Feed deadlines are drawn as deadlines.
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
  /** The curated deadlines around the day (deadlinesBetween); dayContentDeadlines picks the day's. */
  contentDeadlines: readonly ContentDeadline[];
  /** The student's class year, for the curated rows' audiences. */
  standing: ClassStanding | null;
  feedItems: readonly FeedItem[];
  /** Now, when `day` is today (events already over are then left for the ones ahead). */
  now?: Date;
}

export interface Agenda {
  items: TimelineItem[];
  /** The day's curated deadlines without a published time (listed with the timeline). */
  allDay: AllDayDeadline[];
  startHour: number;
  endHour: number;
  /** Timed campus events that day (not over yet, on the current day) not drawn on the timeline. */
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

/**
 * The curated deadlines that belong to one day of the timeline and the strip: calendar rows of category "deadline"
 * and office programs' deadlines due that day, for the student (audienceIncludes). Registration openings and
 * windows are not deadlines: the day summary names an opening ("WebTree opens today") and Due soon lists the
 * window, so they never become "Due" flags on the line.
 */
export function dayContentDeadlines(
  day: string,
  deadlines: readonly ContentDeadline[],
  standing: ClassStanding | null,
): ContentDeadline[] {
  return deadlines.filter((deadline) => {
    if (deadline.date !== day || deadline.endDate) return false;
    if (deadline.kind === "calendar" && calendarCategoryOf(deadline) !== "deadline") return false;
    return audienceIncludes(deadline.audience, standing);
  });
}

function contentTitle(deadline: ContentDeadline): string {
  return deadline.label ? `${deadline.title}: ${deadline.label}` : deadline.title;
}

function contentDeadlineItems(deadlines: readonly ContentDeadline[]): TimelineItem[] {
  return deadlines
    .filter((deadline) => deadline.time)
    .map((deadline) => ({
      id: `content-${deadline.id}`,
      kind: "deadline",
      title: contentTitle(deadline),
      start: deadline.time as string,
      source: deadline.source,
    }));
}

/** A deadline of the day without a published time: listed with the timeline, never drawn on it. */
export interface AllDayDeadline {
  id: string;
  title: string;
  source: SourceId;
  url: string;
}

function allDayItems(deadlines: readonly ContentDeadline[]): AllDayDeadline[] {
  return deadlines
    .filter((deadline) => !deadline.time)
    .map((deadline) => ({
      id: `content-${deadline.id}`,
      title: contentTitle(deadline),
      source: deadline.source,
      url: deadline.url,
    }));
}

/** An open-ended event counts as 2 h (docs/CONTRACTS.md server/feeds). */
export const OPEN_ENDED_EVENT_MINUTES = 2 * MINUTES_PER_HOUR;

/** [start, end) of a timed feed item in epoch ms (an open-ended event lasts OPEN_ENDED_EVENT_MINUTES). */
export function feedInterval(item: FeedItem): { start: number; end: number } | null {
  if (!item.startsAt) return null;
  const start = Date.parse(item.startsAt);
  if (Number.isNaN(start)) return null;
  const end = item.endsAt ? Date.parse(item.endsAt) : start + OPEN_ENDED_EVENT_MINUTES * 60_000;
  return { start, end: Number.isNaN(end) ? start : end };
}

/**
 * A campus event of `day` for Today: a timed (not all-day) feed event starting that day. The one rule the day
 * summary ("Club open house is at 7:00 PM") and the timeline (drawn, or counted in "N more campus events") share.
 */
export function isTimedEventOn(item: FeedItem, day: string): boolean {
  return item.kind === "event" && !item.allDay && !!item.startsAt && etDay(item.startsAt) === day;
}

/** Whether a timed event fits on a timeline: it lasts more than 0 and at most MAX_EVENT_MINUTES. */
function fitsTimeline(item: FeedItem): boolean {
  const span = feedInterval(item);
  if (!span) return false;
  const minutes = (span.end - span.start) / 60_000;
  return minutes > 0 && minutes <= MAX_EVENT_MINUTES;
}

function byStartsAt(a: FeedItem, b: FeedItem): number {
  return Date.parse(a.startsAt!) - Date.parse(b.startsAt!) || a.id.localeCompare(b.id);
}

/** Timed feed events of `day` (isTimedEventOn), in start order. */
export function timedFeedItems(day: string, items: readonly FeedItem[]): FeedItem[] {
  return items.filter((item) => isTimedEventOn(item, day)).sort(byStartsAt);
}

/** Feed deadlines (points; events of 1 minute or less, PLAN §5) of `day`, in time order. */
export function feedDeadlinesOn(day: string, items: readonly FeedItem[]): FeedItem[] {
  return items
    .filter(
      (item) =>
        item.kind === "deadline" && !item.allDay && !!item.startsAt && etDay(item.startsAt) === day,
    )
    .sort(byStartsAt);
}

function feedItem(item: FeedItem): TimelineItem {
  const isDeadline = item.kind === "deadline";
  const startsAt = item.startsAt as string;
  const span = feedInterval(item);
  return {
    id: `feed-${item.id}`,
    kind: isDeadline ? "deadline" : "event",
    title: item.title,
    start: etClock(startsAt),
    ...(isDeadline || !span ? {} : { end: etClock(new Date(span.end)) }),
    ...(item.location ? { location: item.location } : {}),
    source: item.source,
  };
}

/** A class meeting as [start, end) in epoch ms. */
export interface ClassSpan {
  start: number;
  end: number;
}

function classSpans(
  entries: readonly Pick<DayScheduleEntry, "startsAt" | "endsAt">[],
): ClassSpan[] {
  return entries.map((entry) => ({
    start: Date.parse(entry.startsAt),
    end: Date.parse(entry.endsAt),
  }));
}

/**
 * The campus events the timeline draws and how many more there are. The pool is the day's timed events
 * (isTimedEventOn), on the current day only those not over yet. Drawn: at most MAX_TIMELINE_EVENTS that fit a
 * timeline (≤ MAX_EVENT_MINUTES; open-ended = 2 h) and do not overlap one of the student's classes (the class
 * must stay readable on a phone, not fold into "3 at the same time"). Every other event in the pool is counted
 * in `more` ("2 more campus events today"), so the link, the timeline and the summary agree. Feed deadlines are
 * not events: they are drawn as deadlines and use none of this budget.
 */
export function pickTimelineEvents(
  day: string,
  items: readonly FeedItem[],
  now?: Date,
  classes: readonly ClassSpan[] = [],
): { shown: FeedItem[]; more: number } {
  let pool = timedFeedItems(day, items);
  if (now && etDay(now) === day) {
    const t = now.getTime();
    pool = pool.filter((item) => (feedInterval(item)?.end ?? 0) > t);
  }
  const shown: FeedItem[] = [];
  for (const item of pool) {
    if (shown.length >= MAX_TIMELINE_EVENTS) break;
    if (!fitsTimeline(item)) continue;
    const span = feedInterval(item)!;
    if (classes.some((c) => span.start < c.end && c.start < span.end)) continue;
    shown.push(item);
  }
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
  const events = pickTimelineEvents(
    input.day,
    input.feedItems,
    input.now,
    classSpans(input.schedule.entries),
  );
  const curated = dayContentDeadlines(input.day, input.contentDeadlines, input.standing);
  const items = [
    ...classItems(input.schedule.entries),
    ...studentDeadlineItems(input.day, input.studentDeadlines),
    ...contentDeadlineItems(curated),
    ...events.shown.map(feedItem),
    ...feedDeadlinesOn(input.day, input.feedItems).map(feedItem),
  ];
  return {
    items,
    allDay: allDayItems(curated),
    ...agendaWindow(items),
    moreEvents: events.more,
  };
}
