/**
 * Pure layout for the day timeline: blocks with overlap lanes, deadlines as point markers, free gaps, the
 * now-line, and what falls outside the visible hours. All times are ET wall-clock minutes (see time-geometry.ts).
 */
import type { SourceId } from "@/lib/sources";
import {
  assignLanes,
  clampToWindow,
  findFreeGaps,
  nowLinePosition,
  parseClock,
  toFraction,
  windowPosition,
  type Interval,
  type TimeWindow,
} from "./time-geometry";

export type TimelineItemKind = "class" | "event" | "deadline";

export interface TimelineItem {
  id: string;
  kind: TimelineItemKind;
  /** Course code with section, e.g. "CSC 221 A" (classes; optional on deadlines and events). */
  code?: string;
  title: string;
  /** "HH:MM", 24 h, ET wall clock. */
  start: string;
  /** "HH:MM"; for a deadline, the same as `start` (or omit it). */
  end?: string;
  location?: string;
  /** Where the item came from; every non-class item shows it as a source tag. */
  source: SourceId;
  /** Second line on a block of an hour or more: instructor, organiser. */
  detail?: string;
}

export interface PlacedTimelineItem {
  item: TimelineItem;
  interval: Interval;
  /** The part inside the window. */
  visible: Interval;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

export interface PlacedDeadline {
  item: TimelineItem;
  minute: number;
  top: number;
}

export interface TimelineGap {
  interval: Interval;
  top: number;
  height: number;
}

export interface TimelineLayout {
  blocks: PlacedTimelineItem[];
  deadlines: PlacedDeadline[];
  gaps: TimelineGap[];
  /** Items entirely before or after the window, listed under it. */
  earlier: { item: TimelineItem; interval: Interval }[];
  later: { item: TimelineItem; interval: Interval }[];
  /** Items whose start/end could not be read (listed, never guessed). */
  unscheduled: TimelineItem[];
  /** Now-line position (fraction of the window), or null when now is unknown or outside it. */
  now: number | null;
  /** The next block to start after now (for "in 1 h 18 m"). */
  nextId: string | null;
  /** Blocks happening at now (for "now · 20 m left"). */
  currentIds: string[];
}

export interface LayoutDayOptions {
  nowMinute?: number | null;
  showFreeGaps?: boolean;
  /** Shortest free gap shown (default 30 minutes). */
  minFreeMinutes?: number;
}

/** An item's span; a deadline is a point. Null when the times cannot be read. */
export function itemInterval(item: TimelineItem): Interval | null {
  const start = parseClock(item.start);
  if (start === null) return null;
  if (item.kind === "deadline") return { start, end: start };
  const end = parseClock(item.end);
  if (end === null || end < start) return null;
  return { start, end };
}

export function layoutDay(
  items: readonly TimelineItem[],
  window: TimeWindow,
  { nowMinute = null, showFreeGaps = false, minFreeMinutes = 30 }: LayoutDayOptions = {},
): TimelineLayout {
  const earlier: TimelineLayout["earlier"] = [];
  const later: TimelineLayout["later"] = [];
  const unscheduled: TimelineItem[] = [];
  const spans: { item: TimelineItem; interval: Interval }[] = [];
  const points: { item: TimelineItem; minute: number }[] = [];

  for (const item of items) {
    const interval = itemInterval(item);
    if (!interval) {
      unscheduled.push(item);
      continue;
    }
    const position = windowPosition(interval, window);
    if (position === "before") earlier.push({ item, interval });
    else if (position === "after") later.push({ item, interval });
    else if (interval.start === interval.end) points.push({ item, minute: interval.start });
    else spans.push({ item, interval });
  }

  const lanes = assignLanes(
    spans.map(({ item, interval }) => {
      const c = clampToWindow(interval, window)!;
      return { id: item.id, start: c.start, end: c.end };
    }),
  );

  const blocks = spans
    .map(({ item, interval }) => {
      const c = clampToWindow(interval, window)!;
      const lane = lanes.get(item.id) ?? { lane: 0, lanes: 1 };
      return {
        item,
        interval,
        visible: { start: c.start, end: c.end },
        top: toFraction(c.start, window),
        height: toFraction(c.end, window) - toFraction(c.start, window),
        lane: lane.lane,
        lanes: lane.lanes,
        clippedStart: c.clippedStart,
        clippedEnd: c.clippedEnd,
      };
    })
    .sort((a, b) => a.interval.start - b.interval.start || a.lane - b.lane);

  const deadlines = points
    .map(({ item, minute }) => ({ item, minute, top: toFraction(minute, window) }))
    .sort((a, b) => a.minute - b.minute);

  const gaps = showFreeGaps
    ? findFreeGaps(
        spans.map((s) => s.interval),
        window,
        { minMinutes: minFreeMinutes },
      ).map((interval) => ({
        interval,
        top: toFraction(interval.start, window),
        height: toFraction(interval.end, window) - toFraction(interval.start, window),
      }))
    : [];

  const byStart = (a: { interval: Interval }, b: { interval: Interval }) =>
    a.interval.start - b.interval.start;
  earlier.sort(byStart);
  later.sort(byStart);

  let nextId: string | null = null;
  const currentIds: string[] = [];
  if (nowMinute !== null) {
    const all = [...spans].sort(byStart);
    nextId = all.find((s) => s.interval.start > nowMinute)?.item.id ?? null;
    for (const s of all) {
      if (s.interval.start <= nowMinute && nowMinute < s.interval.end) currentIds.push(s.item.id);
    }
  }

  return {
    blocks,
    deadlines,
    gaps,
    earlier,
    later,
    unscheduled,
    now: nowMinute === null ? null : nowLinePosition(nowMinute, window),
    nextId,
    currentIds,
  };
}
