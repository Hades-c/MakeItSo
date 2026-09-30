import type * as React from "react";
import { Flag } from "lucide-react";
import { CourseCode } from "@/components/ui/course-code";
import { SourceTag } from "@/components/ui/source-tag";
import { COURSE_COLOR_CLASSES, courseColor } from "@/lib/course-color";
import { wallClockMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  axisHours,
  clockLabel,
  formatDuration,
  hourLabel,
  MINUTES_PER_HOUR,
  percent,
  toFraction,
  windowFromHours,
  windowLabel,
  type Interval,
} from "./time-geometry";
import {
  layoutDay,
  type PlacedDeadline,
  type PlacedTimelineItem,
  type TimelineGap,
  type TimelineItem,
} from "./timeline-layout";

export type { TimelineItem, TimelineItemKind } from "./timeline-layout";

/** The first thing on the next school day, shown under the timeline ("Tomorrow 9:40 · …"). */
export interface TimelineNextUp {
  code?: string;
  /** e.g. "Tomorrow 9:40" or "Thu 9:40a". */
  when: string;
  title: string;
  location?: string;
}

export interface DayTimelineProps {
  /** Current instant; draws the now-line and "in 1 h 18 m" when it falls inside the view. */
  now?: Date | string | number;
  /** Zone `now` is read in (APP_TIMEZONE); item times are already ET wall clock. */
  timeZone: string;
  /** First and last whole hour shown. Items outside are listed under the view, never dropped. */
  startHour: number;
  endHour: number;
  items: readonly TimelineItem[];
  /** Mark free stretches between items ("2 h 10 m free"). */
  showFreeGaps: boolean;
  /** Shortest free stretch worth marking, in minutes (default 30). */
  minFreeMinutes?: number;
  /** Accessible name of the list, e.g. "Schedule for Wednesday, September 30". */
  label?: string;
  nextUp?: TimelineNextUp;
  className?: string;
}

/** Blocks of at least this many minutes show their detail line (instructor, organiser). */
const DETAIL_MIN_MINUTES = 60;
/** Blocks shorter than this (on screen) get a one-line layout. */
const TWO_LINE_MIN_MINUTES = 40;

function span(interval: Interval): string {
  return interval.end > interval.start
    ? `${clockLabel(interval.start)}–${clockLabel(interval.end)}`
    : clockLabel(interval.start);
}

/**
 * Today, to scale: classes coloured by course, campus events with their source tag, deadlines as point markers,
 * free gaps, and a red now-line (Davidson Red means "now"). Proportional minutes in ET wall-clock time; renders on
 * the server. The list is chronological for screen readers, with each item's times spelled out.
 */
export function DayTimeline({
  now,
  timeZone,
  startHour,
  endHour,
  items,
  showFreeGaps,
  minFreeMinutes,
  label = "Today's schedule",
  nextUp,
  className,
}: DayTimelineProps) {
  const window = windowFromHours(startHour, endHour);
  const nowDate = now === undefined ? null : new Date(now);
  const nowMinute =
    nowDate && !Number.isNaN(nowDate.getTime()) ? wallClockMinutes(nowDate, timeZone) : null;
  const layout = layoutDay(items, window, { nowMinute, showFreeGaps, minFreeMinutes });
  const hours = axisHours(window);

  type Entry = { start: number; key: string; node: React.ReactNode };
  const entries: Entry[] = [
    ...layout.blocks.map((b) => ({
      start: b.interval.start,
      key: `b-${b.item.id}`,
      node: (
        <TimelineBlock
          key={b.item.id}
          placed={b}
          relative={relativeLabel(b, layout.nextId, layout.currentIds, nowMinute)}
        />
      ),
    })),
    ...layout.gaps.map((g) => ({
      start: g.interval.start,
      key: `g-${g.interval.start}`,
      node: (
        <FreeGap
          key={`gap-${g.interval.start}`}
          gap={g}
          labelAtTop={layout.deadlines.some(
            (d) => d.minute > g.interval.start && d.minute <= g.interval.end,
          )}
        />
      ),
    })),
    ...layout.deadlines.map((d) => ({
      start: d.minute,
      key: `d-${d.item.id}`,
      node: <DeadlineMarker key={d.item.id} placed={d} timeZone={timeZone} />,
    })),
  ].sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));

  const style = { "--tl-hours": hours.length - 1 } as React.CSSProperties;

  return (
    <div className={className} data-testid="day-timeline">
      <div
        className="grid grid-cols-[2.5rem_minmax(0,1fr)] py-2 md:grid-cols-[3.25rem_minmax(0,1fr)]"
        style={style}
      >
        <div
          aria-hidden
          className="relative h-[calc(var(--tl-hours)*4rem)] md:h-[calc(var(--tl-hours)*4.125rem)]"
        >
          {hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 font-mono text-xs leading-none text-fg-3 md:right-3"
              style={{ top: percent(toFraction(hour * MINUTES_PER_HOUR, window)) }}
            >
              {hourLabel(hour)}
            </span>
          ))}
        </div>
        <div className="relative h-[calc(var(--tl-hours)*4rem)] border-l border-line md:h-[calc(var(--tl-hours)*4.125rem)]">
          {hours.map((hour) => (
            <span
              key={hour}
              aria-hidden
              className="absolute inset-x-0 border-t border-line"
              style={{ top: percent(toFraction(hour * MINUTES_PER_HOUR, window)) }}
            />
          ))}
          {nowMinute !== null && layout.now !== null ? (
            <p className="sr-only">Now: {clockLabel(nowMinute)}</p>
          ) : null}
          <ol
            aria-label={`${label}, ${windowLabel(startHour, endHour)}`}
            className="absolute inset-0"
          >
            {entries.map((e) => e.node)}
          </ol>
          {nowMinute !== null && layout.now !== null ? (
            <div
              aria-hidden
              data-testid="now-line"
              className="pointer-events-none absolute right-0 -left-1.5 z-20 border-t-2 border-urgent"
              style={{ top: percent(layout.now) }}
            >
              <span className="absolute -top-1.5 -left-px size-2.5 rounded-full bg-urgent" />
              <span className="absolute -top-2.75 right-0 rounded-full bg-urgent-fill px-1.75 py-0.5 font-mono text-xs leading-4 font-semibold text-on-urgent">
                {clockLabel(nowMinute)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {layout.earlier.length > 0 ? (
        <OutsideList heading="Earlier today" entries={layout.earlier} timeZone={timeZone} />
      ) : null}
      {layout.later.length > 0 ? (
        <OutsideList heading="Later today" entries={layout.later} timeZone={timeZone} />
      ) : null}
      {layout.unscheduled.length > 0 ? (
        <OutsideList
          heading="Time not listed"
          entries={layout.unscheduled.map((item) => ({ item }))}
          timeZone={timeZone}
        />
      ) : null}

      {nextUp ? (
        <p className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md bg-surface-2 px-3 py-2.5 text-sm text-fg-2">
          {nextUp.code ? <CourseCode code={nextUp.code} /> : null}
          <span className="min-w-0">
            <b className="font-semibold text-fg">{nextUp.when}</b> · {nextUp.title}
            {nextUp.location ? ` · ${nextUp.location}` : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function relativeLabel(
  placed: PlacedTimelineItem,
  nextId: string | null,
  currentIds: readonly string[],
  nowMinute: number | null,
): string | null {
  if (nowMinute === null) return null;
  if (currentIds.includes(placed.item.id)) {
    return `now · ${formatDuration(placed.interval.end - nowMinute)} left`;
  }
  if (placed.item.id === nextId) return `in ${formatDuration(placed.interval.start - nowMinute)}`;
  return null;
}

function laneBox(lane: number, lanes: number) {
  return {
    left: `calc(0.625rem + (100% - 0.875rem) * ${lane} / ${lanes})`,
    width: `calc((100% - 0.875rem) / ${lanes} - ${lanes > 1 ? "0.375rem" : "0rem"})`,
  };
}

function TimelineBlock({
  placed,
  relative,
}: {
  placed: PlacedTimelineItem;
  relative: string | null;
}) {
  const { item, interval } = placed;
  const isClass = item.kind === "class";
  const colors = item.code ? COURSE_COLOR_CLASSES[courseColor(item.code)] : null;
  const visibleMinutes = placed.visible.end - placed.visible.start;
  // Density: one line for short (or clipped) blocks, a single stacked column in a shared lane, else the full
  // Lakeside block with a right-hand column. Overflow is hidden, so extra lines never spill.
  const density =
    visibleMinutes < TWO_LINE_MIN_MINUTES ? "tiny" : placed.lanes > 1 ? "narrow" : "full";
  const edge = [
    placed.clippedStart ? `from ${clockLabel(interval.start)}` : null,
    placed.clippedEnd ? `until ${clockLabel(interval.end)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const when = isClass ? edge : span(interval);
  const meta = [when, item.location].filter(Boolean).join(" · ");
  const spoken = [`${span(interval)}:`, item.code, item.title, item.detail, item.location, relative]
    .filter(Boolean)
    .join(", ");

  const code = item.code ? (
    <span
      className={cn(
        "block truncate font-mono text-xs leading-4 font-semibold whitespace-nowrap",
        colors?.text,
      )}
    >
      {item.code}
    </span>
  ) : null;
  const title = (
    <span className="block truncate text-sm leading-tight font-strong text-fg md:text-base">
      {item.title}
    </span>
  );
  const rel = relative ? (
    <span
      className={cn("text-xs leading-4 font-strong whitespace-nowrap", colors?.text ?? "text-fg")}
    >
      {relative}
    </span>
  ) : null;
  // In a shared lane the tag may be cut short with an ellipsis; its accessible name stays whole.
  const tag = !isClass ? (
    <SourceTag
      source={item.source}
      className={density === "narrow" ? "inline-block max-w-full min-w-0 truncate" : "shrink-0"}
    />
  ) : null;

  let body: React.ReactNode;
  if (density === "tiny") {
    body = (
      <span className="flex h-full min-w-0 items-center gap-2">
        <span aria-hidden className="flex min-w-12 flex-[1_1_auto] items-center gap-2">
          {code ? <span className="shrink-0">{code}</span> : null}
          <span className="min-w-0 truncate text-sm leading-tight font-strong text-fg">
            {item.title}
          </span>
        </span>
        {tag}
        <span aria-hidden className="flex min-w-0 shrink-[10]">
          {rel ??
            (meta ? <span className="truncate font-mono text-xs text-fg-2">{meta}</span> : null)}
        </span>
      </span>
    );
  } else if (density === "narrow") {
    // A shared lane fits about three short lines: class → code, title, "now"/"in" note (or room);
    // event → title and its source tag.
    body = (
      <span className="flex min-w-0 flex-col items-start">
        <span aria-hidden className="flex w-full min-w-0 flex-col">
          {code ?? title}
          {code ? title : null}
          {isClass
            ? (rel ??
              (meta ? (
                <span className="truncate font-mono text-xs leading-4 text-fg-2">{meta}</span>
              ) : null))
            : null}
        </span>
        {tag ? <span className="mt-0.5 flex max-w-full min-w-0">{tag}</span> : null}
      </span>
    );
  } else {
    body = (
      <span className="flex justify-between gap-3">
        <span className="flex min-w-0 flex-col items-start">
          <span aria-hidden className="flex w-full min-w-0 flex-col">
            {code}
            {title}
            {item.detail && visibleMinutes >= DETAIL_MIN_MINUTES ? (
              <span className="mt-0.5 truncate text-xs text-fg-2 md:text-sm">{item.detail}</span>
            ) : null}
          </span>
          {tag ? <span className="mt-1">{tag}</span> : null}
        </span>
        <span aria-hidden className="flex shrink-0 flex-col items-end text-right">
          {meta ? (
            <span className="font-mono text-xs leading-4 whitespace-nowrap text-fg-2">
              {isClass ? [item.location, edge].filter(Boolean).join(" · ") : meta}
            </span>
          ) : null}
          {rel ? <span className="mt-1">{rel}</span> : null}
        </span>
      </span>
    );
  }

  return (
    <li
      data-source={item.source}
      data-kind={item.kind}
      data-density={density}
      data-lane={`${placed.lane + 1}/${placed.lanes}`}
      data-course-color={item.code ? courseColor(item.code) : undefined}
      className={cn(
        "absolute min-h-6 overflow-hidden rounded-md border-l-4",
        density === "tiny"
          ? "px-2.5 py-0.5"
          : density === "narrow"
            ? "px-2 py-1 md:px-2.5 md:py-1.5"
            : "px-2.5 py-1.5 md:px-3 md:py-2",
        isClass && colors ? cn(colors.chip, colors.border) : "border-taupe bg-surface-2 text-fg",
        placed.clippedStart && "rounded-t-none",
        placed.clippedEnd && "rounded-b-none",
      )}
      style={{
        top: percent(placed.top),
        height: `calc(${percent(placed.height)} - 2px)`,
        ...laneBox(placed.lane, placed.lanes),
      }}
    >
      <span className="sr-only">{spoken}</span>
      {body}
    </li>
  );
}

function FreeGap({ gap, labelAtTop }: { gap: TimelineGap; labelAtTop: boolean }) {
  return (
    <li
      className={cn(
        "absolute right-1 left-2.5 flex justify-center rounded-md border-[1.5px] border-dashed border-line-2 px-2 text-xs text-fg-3",
        // A deadline marker sits near the end of this gap: keep the label clear of it.
        labelAtTop ? "items-start pt-1.5" : "items-center",
      )}
      style={{
        top: `calc(${percent(gap.top)} + 0.25rem)`,
        height: `calc(${percent(gap.height)} - 0.5rem)`,
      }}
      data-kind="free"
    >
      <span className="font-semibold text-fg-2">
        {formatDuration(gap.interval.end - gap.interval.start)} free
      </span>
      <span className="sr-only">
        , {clockLabel(gap.interval.start)} to {clockLabel(gap.interval.end)}
      </span>
    </li>
  );
}

function DeadlineMarker({ placed, timeZone }: { placed: PlacedDeadline; timeZone: string }) {
  const { item, minute } = placed;
  // The label sits just above its line (in the free time before the deadline), or below it at the very top.
  const below = placed.top < 0.08;
  return (
    <li
      data-source={item.source}
      data-kind="deadline"
      className="absolute inset-x-0 z-10 h-0"
      style={{ top: percent(placed.top) }}
    >
      <span
        aria-hidden
        className="absolute -top-px right-0 -left-1.5 border-t-2 border-dashed border-fg-3"
      />
      <div
        className={cn(
          "absolute left-2.5 flex w-fit max-w-[calc(100%-0.875rem)] items-center gap-2 rounded-sm border border-line-strong bg-surface px-2 py-0.5 text-xs shadow-card",
          below ? "top-1" : "bottom-1",
        )}
      >
        <Flag aria-hidden className="size-3.5 shrink-0 text-fg-2" />
        <span className="shrink-0 font-mono text-fg-2">
          <span className="sr-only">Due </span>
          {clockLabel(minute)}
        </span>
        <span className="min-w-0 truncate font-semibold text-fg">{item.title}</span>
        {item.code ? <CourseCode code={item.code} className="shrink-0" /> : null}
        <SourceTag source={item.source} timeZone={timeZone} className="shrink-0" />
      </div>
    </li>
  );
}

function OutsideList({
  heading,
  entries,
  timeZone,
}: {
  heading: string;
  entries: { item: TimelineItem; interval?: Interval }[];
  timeZone: string;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold text-fg-2">{heading}</p>
      <ul className="flex flex-col gap-1.5">
        {entries.map(({ item, interval }) => (
          <li
            key={item.id}
            data-source={item.source}
            data-kind={item.kind}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-sm"
          >
            {interval ? (
              <span className="font-mono text-xs text-fg-2">
                {item.kind === "deadline" ? <span className="sr-only">Due </span> : null}
                {span(interval)}
              </span>
            ) : null}
            {item.code ? <CourseCode code={item.code} /> : null}
            <span className="min-w-0 font-semibold text-fg">{item.title}</span>
            {item.location ? <span className="text-xs text-fg-2">{item.location}</span> : null}
            {item.kind !== "class" ? <SourceTag source={item.source} timeZone={timeZone} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
