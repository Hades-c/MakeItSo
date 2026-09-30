/**
 * Pure layout for the week grid: which blocks go on which day, their vertical position and overlap lanes, which
 * are listed instead (time TBA, or outside the visible hours), and a plain-text summary of every conflict.
 */
import {
  assignLanes,
  clampToWindow,
  clockLabel,
  overlaps,
  parseSpan,
  toFraction,
  type Interval,
  type ItemSpan,
  type TimeWindow,
} from "./time-geometry";
import { DAY_NAMES, joinDayNames, sortDays, WEEKDAYS_ONLY, type WeekDay } from "./week-days";

/** One weekly meeting of a section, as the week grid shows it. */
export interface WeekGridBlock {
  /** Unique per block (e.g. `${crn}-${day}-${start}`). */
  id: string;
  /** Course code with section, e.g. "CSC 221 A". Also decides the course colour. */
  code: string;
  title?: string;
  /** Meeting day. Missing → listed as "Time TBA". */
  day?: WeekDay;
  /** "HH:MM" (24 h, ET wall clock). Missing → listed as "Time TBA". */
  start?: string;
  end?: string;
  room?: string;
  /** Overlaps another block the student plans to take (the plan service decides). */
  conflict?: boolean;
  /** Not yet in the plan (a candidate section, an unconfirmed choice): drawn dashed. */
  tentative?: boolean;
  /** The schedule says "Time TBA": never placed on the grid. */
  tba?: boolean;
}

export interface PlacedBlock {
  block: WeekGridBlock;
  day: WeekDay;
  /** Full meeting time (to 24:00 for a meeting that runs past midnight; `shownEnd` is its real end). */
  interval: ItemSpan;
  /** Fractions of the window for `top` and `height`. */
  top: number;
  height: number;
  lane: number;
  lanes: number;
  clippedStart: boolean;
  /** Ends after the window, or after midnight. */
  clippedEnd: boolean;
}

export interface ListedBlock {
  block: WeekGridBlock;
  day?: WeekDay;
  interval?: ItemSpan;
}

export interface WeekLayout {
  days: WeekDay[];
  byDay: Record<WeekDay, PlacedBlock[]>;
  /** Time TBA (or no usable day/time): listed under the grid. */
  tba: ListedBlock[];
  /** Entirely before or after the visible hours: listed under the grid. */
  outside: ListedBlock[];
  /** One sentence per conflicting pair, e.g. "HIS 357 A overlaps ENG 260 A on Tue, Thu (12:15p–12:30p)." */
  conflicts: string[];
}

function emptyByDay(): Record<WeekDay, PlacedBlock[]> {
  return { M: [], T: [], W: [], R: [], F: [], S: [], U: [] };
}

/**
 * Lay out a week. `days` are the columns to show (default Monday–Friday); a block on another day adds that day's
 * column, so nothing is silently dropped.
 */
export function layoutWeek(
  blocks: readonly WeekGridBlock[],
  window: TimeWindow,
  days: readonly WeekDay[] = WEEKDAYS_ONLY,
): WeekLayout {
  const byDay = emptyByDay();
  const tba: ListedBlock[] = [];
  const outside: ListedBlock[] = [];
  const timed: { block: WeekGridBlock; day: WeekDay; interval: ItemSpan }[] = [];

  for (const block of blocks) {
    // A meeting that ends after midnight is drawn to 24:00 ("until 12:30a"), not listed as TBA.
    const interval = block.tba ? null : parseSpan(block.start, block.end);
    if (!block.day || !interval || interval.end === interval.start) {
      tba.push({ block, day: block.day });
      continue;
    }
    timed.push({ block, day: block.day, interval });
  }

  const shownDays = sortDays([...days, ...timed.map((t) => t.day)]);

  for (const day of shownDays) {
    const onDay = timed.filter((t) => t.day === day);
    const visible = onDay
      .map((t) => ({ ...t, clamped: clampToWindow(t.interval, window) }))
      .filter((t) => {
        if (t.clamped) return true;
        outside.push({ block: t.block, day, interval: t.interval });
        return false;
      });
    const lanes = assignLanes(
      visible.map((t) => ({ id: t.block.id, start: t.clamped!.start, end: t.clamped!.end })),
    );
    byDay[day] = visible
      .map((t) => {
        const c = t.clamped!;
        const lane = lanes.get(t.block.id) ?? { lane: 0, lanes: 1 };
        return {
          block: t.block,
          day,
          interval: t.interval,
          top: toFraction(c.start, window),
          height: toFraction(c.end, window) - toFraction(c.start, window),
          lane: lane.lane,
          lanes: lane.lanes,
          clippedStart: c.clippedStart,
          clippedEnd: c.clippedEnd || t.interval.pastMidnight,
        };
      })
      .sort((a, b) => a.interval.start - b.interval.start || a.lane - b.lane);
  }

  outside.sort(
    (a, b) =>
      shownDays.indexOf(a.day!) - shownDays.indexOf(b.day!) ||
      (a.interval?.start ?? 0) - (b.interval?.start ?? 0),
  );

  return { days: shownDays, byDay, tba, outside, conflicts: describeConflicts(timed) };
}

function describeConflicts(
  timed: readonly { block: WeekGridBlock; day: WeekDay; interval: Interval }[],
): string[] {
  const pairs = new Map<
    string,
    { first: string; second: string; days: Set<WeekDay>; spans: Set<string>; order: number }
  >();
  const involved = new Set<string>();
  const ordered = [...timed].sort(
    (a, b) =>
      shownIndex(a.day) - shownIndex(b.day) ||
      a.interval.start - b.interval.start ||
      a.block.code.localeCompare(b.block.code),
  );

  ordered.forEach((a, i) => {
    for (const b of ordered.slice(i + 1)) {
      if (a.day !== b.day || !(a.block.conflict || b.block.conflict)) continue;
      if (!overlaps(a.interval, b.interval)) continue;
      // Name the later-starting block first: it is the one that "overlaps" the earlier one.
      const [first, second] = b.interval.start >= a.interval.start ? [b, a] : [a, b];
      const key = `${first.block.code}|${second.block.code}`;
      const span = `${clockLabel(Math.max(a.interval.start, b.interval.start))}–${clockLabel(
        Math.min(a.interval.end, b.interval.end),
      )}`;
      const entry = pairs.get(key) ?? {
        first: first.block.code,
        second: second.block.code,
        days: new Set<WeekDay>(),
        spans: new Set<string>(),
        order: pairs.size,
      };
      entry.days.add(a.day);
      entry.spans.add(span);
      pairs.set(key, entry);
      involved.add(a.block.id).add(b.block.id);
    }
  });

  const sentences = [...pairs.values()]
    .sort((x, y) => x.order - y.order)
    .map((p) => {
      const when = p.spans.size === 1 ? ` (${[...p.spans][0]})` : "";
      return `${p.first} overlaps ${p.second} on ${joinDayNames(p.days)}${when}.`;
    });

  // A block the plan service flagged whose partner is not on this grid.
  const lone = new Map<string, Set<WeekDay>>();
  for (const t of ordered) {
    if (!t.block.conflict || involved.has(t.block.id)) continue;
    lone.set(t.block.code, (lone.get(t.block.code) ?? new Set()).add(t.day));
  }
  for (const [code, onDays] of lone) {
    sentences.push(`${code} has a time conflict on ${joinDayNames(onDays)}.`);
  }
  return sentences;
}

function shownIndex(day: WeekDay): number {
  return Object.keys(DAY_NAMES).indexOf(day);
}

/** Screen-reader phrase for one block: "CSC 221 A, Data Structures, Monday 10:30a to 11:20a, Watson 132". */
export function describeBlock(
  block: WeekGridBlock,
  day?: WeekDay,
  interval?: Interval & { shownEnd?: number },
): string {
  const parts = [block.code];
  if (block.title) parts.push(block.title);
  if (day && interval) {
    parts.push(
      `${DAY_NAMES[day].long} ${clockLabel(interval.start)} to ${clockLabel(interval.shownEnd ?? interval.end)}`,
    );
  } else {
    parts.push("time TBA");
  }
  if (block.room) parts.push(block.room);
  if (block.tentative) parts.push("tentative");
  if (block.conflict) parts.push("time conflict");
  return parts.join(", ");
}
