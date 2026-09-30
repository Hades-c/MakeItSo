/**
 * Time geometry for the day timeline and the week grid. Pure and isomorphic.
 *
 * Every time here is an ET wall-clock minute of the day (0 = midnight, 600 = 10:00, 1440 = the next midnight),
 * exactly as the Davidson schedule prints it ("1030" → 630). There is no Date and no time zone in this module, so a
 * DST change never moves a class: callers convert a real instant with `wallClockMinutes()` from lib/format.ts.
 */

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** A half-open span [start, end) in wall-clock minutes. `start === end` is a point in time (a deadline). */
export interface Interval {
  start: number;
  end: number;
}

/** The visible part of the day, in wall-clock minutes. */
export type TimeWindow = Interval;

/** "10:30", "9:05", "1030" (the Davidson API format) or "24:00" → minutes; anything else → null. */
export function parseClock(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  const total = hours * MINUTES_PER_HOUR + minutes;
  return total > MINUTES_PER_DAY ? null : total;
}

/** A start/end pair of clock strings as an interval; null when either is missing or end is before start. */
export function parseInterval(
  start: string | null | undefined,
  end: string | null | undefined,
): Interval | null {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s === null || e === null || e < s) return null;
  return { start: s, end: e };
}

function hour12(minutes: number): { hour: number; minute: number; period: "a" | "p" } {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(m / MINUTES_PER_HOUR);
  return {
    hour: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: m % MINUTES_PER_HOUR,
    period: h24 < 12 ? "a" : "p",
  };
}

/** Registrar-ledger clock for a wall-clock minute: 572 → "9:32a", 720 → "12:00p", 1439 → "11:59p". */
export function clockLabel(minutes: number): string {
  const { hour, minute, period } = hour12(minutes);
  return `${hour}:${String(minute).padStart(2, "0")}${period}`;
}

/** Axis label for a whole hour: 9 → "9a", 12 → "12p", 13 → "1p", 0 and 24 → "12a". */
export function hourLabel(hour: number): string {
  const { hour: h, period } = hour12(hour * MINUTES_PER_HOUR);
  return `${h}${period}`;
}

/** Compact axis label without a period, as in the week grid: 9 → "9", 13 → "1". */
export function shortHourLabel(hour: number): string {
  return String(hour12(hour * MINUTES_PER_HOUR).hour);
}

/** "9a–4p" for a window of whole hours. */
export function windowLabel(startHour: number, endHour: number): string {
  return `${hourLabel(startHour)}–${hourLabel(endHour)}`;
}

/** 130 → "2 h 10 m", 60 → "1 h", 45 → "45 m", 0 → "0 m". Negative input counts as 0. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / MINUTES_PER_HOUR);
  const m = total % MINUTES_PER_HOUR;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** Window for whole hours, e.g. (9, 16) → 9:00–16:00. `endHour` must be after `startHour`. */
export function windowFromHours(startHour: number, endHour: number): TimeWindow {
  const start = Math.max(0, Math.min(24, Math.floor(startHour))) * MINUTES_PER_HOUR;
  const end = Math.max(0, Math.min(24, Math.ceil(endHour))) * MINUTES_PER_HOUR;
  if (end <= start)
    throw new RangeError(`endHour (${endHour}) must be after startHour (${startHour})`);
  return { start, end };
}

/** Whole hours shown on an axis for the window: (9:00–16:00) → [9, 10, …, 16]. */
export function axisHours(window: TimeWindow): number[] {
  const first = Math.ceil(window.start / MINUTES_PER_HOUR);
  const last = Math.floor(window.end / MINUTES_PER_HOUR);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}

/** Vertical offset in px of a wall-clock minute, measured from the top of the window. Not clamped. */
export function minutesToPx(minute: number, window: TimeWindow, pxPerHour: number): number {
  return ((minute - window.start) * pxPerHour) / MINUTES_PER_HOUR;
}

/** Inverse of minutesToPx: the wall-clock minute at a vertical offset. Not clamped. */
export function pxToMinutes(px: number, window: TimeWindow, pxPerHour: number): number {
  return window.start + (px * MINUTES_PER_HOUR) / pxPerHour;
}

/** Height in px of the whole window. */
export function windowHeightPx(window: TimeWindow, pxPerHour: number): number {
  return minutesToPx(window.end, window, pxPerHour);
}

/** Position of a minute as a fraction of the window (0 = top, 1 = bottom). Not clamped. */
export function toFraction(minute: number, window: TimeWindow): number {
  return (minute - window.start) / (window.end - window.start);
}

/** A fraction as a CSS percentage string with 4 decimals ("41.4286%"), for `top`/`height` styles. */
export function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(4))}%`;
}

export interface ClampedInterval extends Interval {
  /** The item starts before the window (drawn from the top edge). */
  clippedStart: boolean;
  /** The item ends after the window (drawn to the bottom edge). */
  clippedEnd: boolean;
}

/**
 * The part of an interval inside the window, with flags for the edges it crosses; null when nothing of it is
 * visible. A point (deadline) is visible when it lies within the window, including exactly on either edge.
 */
export function clampToWindow(interval: Interval, window: TimeWindow): ClampedInterval | null {
  if (interval.start === interval.end) {
    if (interval.start < window.start || interval.start > window.end) return null;
    return { ...interval, clippedStart: false, clippedEnd: false };
  }
  if (interval.end <= window.start || interval.start >= window.end) return null;
  return {
    start: Math.max(interval.start, window.start),
    end: Math.min(interval.end, window.end),
    clippedStart: interval.start < window.start,
    clippedEnd: interval.end > window.end,
  };
}

/** Where an interval sits relative to the window. */
export function windowPosition(
  interval: Interval,
  window: TimeWindow,
): "before" | "inside" | "after" {
  if (clampToWindow(interval, window)) return "inside";
  return interval.end <= window.start ? "before" : "after";
}

/** True when two spans share time. Touching spans (10:30–11:20 and 11:20–12:10) do not overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface LaneAssignment {
  /** 0-based column inside the overlap group. */
  lane: number;
  /** Columns in the item's overlap group (1 when it overlaps nothing). */
  lanes: number;
}

/**
 * Side-by-side columns for overlapping items (greedy colouring of the interval graph, which is optimal for
 * intervals): each item takes the lowest free lane, and every item in a connected overlap group gets that group's
 * lane count so the group splits its width evenly.
 *
 * Stable: items are processed by start, then longer first, then id, then input order, so the same set of items
 * always gets the same lanes whatever order it arrives in. Zero-length items take no lane: give them their own
 * marker instead (see DayTimeline deadlines).
 */
export function assignLanes<T extends Interval & { id: string }>(
  items: readonly T[],
): Map<string, LaneAssignment> {
  const order = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.end > item.start)
    .sort(
      (a, b) =>
        a.item.start - b.item.start ||
        b.item.end - a.item.end ||
        (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0) ||
        a.index - b.index,
    );

  const result = new Map<string, LaneAssignment>();
  let group: string[] = [];
  let groupEnd = -Infinity;
  let laneEnds: number[] = [];

  const closeGroup = () => {
    for (const id of group) {
      const entry = result.get(id);
      if (entry) entry.lanes = laneEnds.length;
    }
    group = [];
    laneEnds = [];
  };

  for (const { item } of order) {
    if (item.start >= groupEnd) {
      closeGroup();
      groupEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    result.set(item.id, { lane, lanes: 1 });
    group.push(item.id);
    groupEnd = Math.max(groupEnd, item.end);
  }
  closeGroup();
  return result;
}

/** Busy spans merged into disjoint, sorted intervals (touching spans merge). Points are ignored. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push(span);
  }
  return merged;
}

export interface FreeGapOptions {
  /** Shortest gap worth showing, in minutes (default 30). */
  minMinutes?: number;
}

/**
 * Free time between busy items inside the window: the gaps between consecutive busy spans (after merging
 * overlaps), at least `minMinutes` long. Time before the first item and after the last one is not a "gap".
 * Busy spans are clamped to the window first, so an item crossing an edge still bounds a gap.
 */
export function findFreeGaps(
  busy: readonly Interval[],
  window: TimeWindow,
  { minMinutes = 30 }: FreeGapOptions = {},
): Interval[] {
  const visible = busy
    .map((span) => clampToWindow(span, window))
    .filter((span): span is ClampedInterval => span !== null && span.end > span.start);
  const merged = mergeIntervals(visible);
  const gaps: Interval[] = [];
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1] as Interval;
    const next = merged[i] as Interval;
    if (next.start - prev.end >= minMinutes) gaps.push({ start: prev.end, end: next.start });
  }
  return gaps;
}

/** The now-line position as a fraction of the window, or null when now is outside it (no line is drawn). */
export function nowLinePosition(nowMinute: number, window: TimeWindow): number | null {
  if (nowMinute < window.start || nowMinute > window.end) return null;
  return toFraction(nowMinute, window);
}

/**
 * The smallest window of whole hours that shows every item and at least [minStartHour, minEndHour]: use it to
 * stretch a 9a–4p view for an evening event instead of hiding it.
 */
export function windowForItems(
  items: readonly Interval[],
  minStartHour: number,
  minEndHour: number,
): TimeWindow {
  let start = Math.floor(minStartHour) * MINUTES_PER_HOUR;
  let end = Math.ceil(minEndHour) * MINUTES_PER_HOUR;
  for (const item of items) {
    start = Math.min(start, Math.floor(item.start / MINUTES_PER_HOUR) * MINUTES_PER_HOUR);
    end = Math.max(end, Math.ceil(item.end / MINUTES_PER_HOUR) * MINUTES_PER_HOUR);
  }
  return { start: Math.max(0, start), end: Math.min(MINUTES_PER_DAY, Math.max(end, start + 60)) };
}
