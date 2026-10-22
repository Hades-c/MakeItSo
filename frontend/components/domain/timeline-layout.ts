/**
 * Pure layout for the day timeline: blocks with overlap lanes and their overlap groups, deadlines as point markers
 * with a label placed only where it cannot cover anything, free gaps, the now-line, and what falls outside the
 * visible hours. All times are ET wall-clock minutes (see time-geometry.ts).
 */
import type { SourceId } from "@/lib/sources";
import {
  assignLanes,
  clampToWindow,
  findFreeGaps,
  MINUTES_PER_HOUR,
  nowLinePosition,
  overlaps,
  parseClock,
  parseSpan,
  toFraction,
  windowPosition,
  type Interval,
  type ItemSpan,
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
  /** "HH:MM"; for a deadline, the same as `start` (or omit it). Before `start` = runs past midnight. */
  end?: string;
  location?: string;
  /** Where the item came from; every non-class item shows it as a source tag. */
  source: SourceId;
  /** Second line on a block of an hour or more: instructor, organiser. */
  detail?: string;
}

export interface PlacedTimelineItem {
  item: TimelineItem;
  interval: ItemSpan;
  /** The part inside the window. */
  visible: Interval;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  /** Index into `groups` when the block shares time with others (lanes > 1), else null. */
  group: number | null;
  clippedStart: boolean;
  /** Ends after the window, or after midnight. */
  clippedEnd: boolean;
}

/** Where a deadline's label goes: in free time just above or below its line, or (null) in the list under the view. */
export type DeadlineLabelPlacement = "above" | "below" | null;

export interface PlacedDeadline {
  item: TimelineItem;
  minute: number;
  top: number;
  label: DeadlineLabelPlacement;
  /** The free time the label may take up (null when it is listed instead). */
  labelSpan: Interval | null;
}

/** Where the "1 h 5 m free" text sits in its gap: clear of any deadline label inside the gap. */
export type GapTextPlacement = "center" | "start" | "end" | "hidden";

export interface TimelineGap {
  interval: Interval;
  top: number;
  height: number;
  text: GapTextPlacement;
}

/** Blocks that share time (drawn side by side in lanes, or as one "3 at the same time" block when narrow). */
export interface OverlapGroup {
  interval: Interval;
  top: number;
  height: number;
  lanes: number;
  blocks: PlacedTimelineItem[];
}

export interface TimelineLayout {
  blocks: PlacedTimelineItem[];
  groups: OverlapGroup[];
  deadlines: PlacedDeadline[];
  gaps: TimelineGap[];
  /** Items entirely before or after the window, listed under it. */
  earlier: { item: TimelineItem; interval: ItemSpan }[];
  later: { item: TimelineItem; interval: ItemSpan }[];
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

/**
 * Free time a deadline label needs on its side of the line: the label may wrap to three 12px lines on a phone
 * (title over two lines, then the course code and source tag), 64px at the timeline's 64px an hour.
 */
export const DEADLINE_LABEL_MINUTES = 60;
/** Free time the "1 h 5 m free" text needs inside its gap. */
export const GAP_TEXT_MINUTES = 20;
/**
 * Hour labels closer than this to now are left out of the gutter, where the now pill sits (a 20px pill over a 12px
 * label at 64px an hour).
 */
export const NOW_PILL_CLEARANCE_MINUTES = 17;

/** An item's span; a deadline is a point. Null when the times cannot be read. */
export function itemInterval(item: TimelineItem): ItemSpan | null {
  if (item.kind === "deadline") {
    const start = parseClock(item.start);
    return start === null ? null : { start, end: start, shownEnd: start, pastMidnight: false };
  }
  return parseSpan(item.start, item.end);
}

/**
 * Labels for deadline markers, earliest first. A label goes just above its line when the `reserve` minutes before
 * it are free (no block, no other label, inside the window), else just below, else nowhere: it is listed under the
 * timeline, so a label never covers a class or event.
 */
export function placeDeadlineLabels(
  minutes: readonly number[],
  busy: readonly Interval[],
  window: TimeWindow,
  reserve = DEADLINE_LABEL_MINUTES,
): { label: DeadlineLabelPlacement; span: Interval | null }[] {
  const taken: Interval[] = busy.filter((b) => b.end > b.start);
  const fits = (span: Interval) =>
    span.start >= window.start && span.end <= window.end && !taken.some((t) => overlaps(t, span));
  const order = minutes
    .map((minute, index) => ({ minute, index }))
    .sort((a, b) => a.minute - b.minute);
  const result: { label: DeadlineLabelPlacement; span: Interval | null }[] = minutes.map(() => ({
    label: null,
    span: null,
  }));
  for (const { minute, index } of order) {
    const above = { start: minute - reserve, end: minute };
    const below = { start: minute, end: minute + reserve };
    if (fits(above)) {
      taken.push(above);
      result[index] = { label: "above", span: above };
    } else if (fits(below)) {
      taken.push(below);
      result[index] = { label: "below", span: below };
    }
  }
  return result;
}

/** Where a gap's text can go without meeting the deadline labels inside the gap. */
export function gapTextPlacement(
  gap: Interval,
  labels: readonly Interval[],
  textMinutes = GAP_TEXT_MINUTES,
): GapTextPlacement {
  const inside = labels.filter((l) => overlaps(l, gap));
  if (inside.length === 0) return "center";
  const first = Math.min(...inside.map((l) => l.start));
  const last = Math.max(...inside.map((l) => l.end));
  if (first - gap.start >= textMinutes) return "start";
  if (gap.end - last >= textMinutes) return "end";
  return "hidden";
}

/** Axis hours whose label stays in the gutter: those clear of the now pill. */
export function hourLabelsClearOfNow(
  hours: readonly number[],
  nowMinute: number | null,
  clearance = NOW_PILL_CLEARANCE_MINUTES,
): number[] {
  if (nowMinute === null) return [...hours];
  return hours.filter((h) => Math.abs(h * MINUTES_PER_HOUR - nowMinute) >= clearance);
}

export function layoutDay(
  items: readonly TimelineItem[],
  window: TimeWindow,
  { nowMinute = null, showFreeGaps = false, minFreeMinutes = 30 }: LayoutDayOptions = {},
): TimelineLayout {
  const earlier: TimelineLayout["earlier"] = [];
  const later: TimelineLayout["later"] = [];
  const unscheduled: TimelineItem[] = [];
  const spans: { item: TimelineItem; interval: ItemSpan }[] = [];
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

  const blocks: PlacedTimelineItem[] = spans
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
        group: null,
        clippedStart: c.clippedStart,
        clippedEnd: c.clippedEnd || interval.pastMidnight,
      };
    })
    .sort((a, b) => a.visible.start - b.visible.start || a.lane - b.lane);

  // Overlap groups: connected runs of blocks that share time (touching blocks do not).
  const groups: OverlapGroup[] = [];
  let run: PlacedTimelineItem[] = [];
  let runEnd = -Infinity;
  const closeRun = () => {
    if (run.length > 1) {
      const interval = { start: run[0]!.visible.start, end: runEnd };
      const index = groups.length;
      for (const b of run) b.group = index;
      groups.push({
        interval,
        top: toFraction(interval.start, window),
        height: toFraction(interval.end, window) - toFraction(interval.start, window),
        lanes: Math.max(...run.map((b) => b.lanes)),
        blocks: run,
      });
    }
    run = [];
    runEnd = -Infinity;
  };
  for (const block of blocks) {
    if (block.visible.start >= runEnd) closeRun();
    run.push(block);
    runEnd = Math.max(runEnd, block.visible.end);
  }
  closeRun();

  const sortedPoints = [...points].sort((a, b) => a.minute - b.minute);
  const placements = placeDeadlineLabels(
    sortedPoints.map((p) => p.minute),
    blocks.map((b) => b.visible),
    window,
  );
  const deadlines: PlacedDeadline[] = sortedPoints.map(({ item, minute }, i) => ({
    item,
    minute,
    top: toFraction(minute, window),
    label: placements[i]?.label ?? null,
    labelSpan: placements[i]?.span ?? null,
  }));
  const labelSpans = deadlines.flatMap((d) => (d.labelSpan ? [d.labelSpan] : []));

  const gaps: TimelineGap[] = showFreeGaps
    ? findFreeGaps(
        spans.map((s) => s.interval),
        window,
        { minMinutes: minFreeMinutes },
      ).map((interval) => ({
        interval,
        top: toFraction(interval.start, window),
        height: toFraction(interval.end, window) - toFraction(interval.start, window),
        text: gapTextPlacement(interval, labelSpans),
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
    groups,
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
