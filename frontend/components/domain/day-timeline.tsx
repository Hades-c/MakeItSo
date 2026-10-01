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
  spanLabel,
  toFraction,
  windowFromHours,
  windowLabel,
  type ItemSpan,
} from "./time-geometry";
import {
  hourLabelsClearOfNow,
  layoutDay,
  NOW_PILL_CLEARANCE_MINUTES,
  type OverlapGroup,
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
/** On phones, class blocks at least this long (on screen) also show the room on a line of its own. */
const ROOM_LINE_MIN_MINUTES = 70;
/** Blocks shorter than this (on screen) get a one-line layout. */
const TWO_LINE_MIN_MINUTES = 40;

/**
 * Container widths from which an overlap group with this many lanes is drawn side by side (every lane then fits a
 * 12px course code and a whole source tag). Below them the group is one "3 at the same time" block and its items are
 * listed in full under the timeline. Static strings so Tailwind generates them.
 */
const LANES_FROM: { maxLanes: number; lanes: string; group: string }[] = [
  { maxLanes: 2, lanes: "hidden @min-[28rem]:block", group: "@min-[28rem]:hidden" },
  { maxLanes: 3, lanes: "hidden @min-[38rem]:block", group: "@min-[38rem]:hidden" },
  { maxLanes: Infinity, lanes: "hidden @min-[52rem]:block", group: "@min-[52rem]:hidden" },
];

function lanesFrom(lanes: number) {
  return LANES_FROM.find((t) => lanes <= t.maxLanes) ?? LANES_FROM[LANES_FROM.length - 1]!;
}

/** Printed span of an overlap group: earliest start to latest end, as the items themselves print them. */
function groupSpanLabel(group: OverlapGroup): string {
  const start = Math.min(...group.blocks.map((b) => b.interval.start));
  const last = group.blocks.reduce((a, b) => (b.interval.end > a.interval.end ? b : a));
  return `${clockLabel(start)}–${clockLabel(last.interval.shownEnd)}`;
}

/**
 * Today, to scale: classes coloured by course, campus events with their source tag, deadlines as point markers,
 * free gaps, and a red now-line (Davidson Red means "now"). Proportional minutes in ET wall-clock time; renders on
 * the server. The list is chronological for screen readers, with each item's times spelled out.
 *
 * Nothing is drawn over text: the now pill sits in the hour gutter and the now and deadline lines pass under the
 * blocks; a deadline's label goes only into free time (else it is listed under the view); and when overlapping items
 * would be too narrow for their 12px text they become one "n at the same time" block, listed in full below.
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
  const nowShown = nowMinute !== null && layout.now !== null;
  const shownHours = hourLabelsClearOfNow(hours, nowShown ? nowMinute : null);
  const listedDeadlines = layout.deadlines.filter((d) => d.label === null);
  const relative = (b: PlacedTimelineItem) =>
    relativeLabel(b, layout.nextId, layout.currentIds, nowMinute);

  type Entry = { start: number; key: string; node: React.ReactNode };
  const entries: Entry[] = [
    ...layout.blocks.map((b) => {
      const group = b.group === null ? null : layout.groups[b.group];
      return {
        start: b.visible.start,
        key: `b-${b.item.id}`,
        node: (
          <TimelineBlock
            key={`b-${b.item.id}`}
            placed={b}
            relative={relative(b)}
            className={group ? lanesFrom(group.lanes).lanes : undefined}
          />
        ),
      };
    }),
    ...layout.groups.map((g, i) => ({
      start: g.interval.start,
      key: `a-${i}`,
      node: <GroupBlock key={`group-${i}`} group={g} className={lanesFrom(g.lanes).group} />,
    })),
    ...layout.gaps.map((g) => ({
      start: g.interval.start,
      key: `g-${g.interval.start}`,
      node: <FreeGap key={`gap-${g.interval.start}`} gap={g} />,
    })),
    ...layout.deadlines
      .filter((d) => d.label !== null)
      .map((d) => ({
        start: d.minute,
        key: `d-${d.item.id}`,
        node: <DeadlineMarker key={`d-${d.item.id}`} placed={d} timeZone={timeZone} />,
      })),
  ].sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));

  const style = { "--tl-hours": hours.length - 1 } as React.CSSProperties;
  const height = "h-[calc(var(--tl-hours)*4rem)] md:h-[calc(var(--tl-hours)*4.125rem)]";

  return (
    <div className={cn("@container", className)} data-testid="day-timeline">
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] py-2" style={style}>
        <div aria-hidden data-testid="timeline-gutter" className={cn("relative", height)}>
          {shownHours.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 font-mono text-xs leading-none text-fg-3"
              style={{ top: percent(toFraction(hour * MINUTES_PER_HOUR, window)) }}
            >
              {hourLabel(hour)}
            </span>
          ))}
          {listedDeadlines
            .filter(
              (d) => !nowShown || Math.abs(d.minute - nowMinute) >= NOW_PILL_CLEARANCE_MINUTES,
            )
            .map((d) => (
              <Flag
                key={d.item.id}
                data-testid="deadline-flag"
                className="absolute left-0.5 size-3.5 -translate-y-1/2 text-fg-2"
                style={{ top: percent(d.top) }}
              />
            ))}
          {nowShown ? (
            <span
              data-testid="now-pill"
              className="absolute right-1 z-10 -translate-y-1/2 rounded-full bg-urgent-fill px-1 py-0.5 font-mono text-xs leading-4 font-semibold whitespace-nowrap text-on-urgent"
              style={{ top: percent(layout.now!) }}
            >
              {clockLabel(nowMinute)}
            </span>
          ) : null}
        </div>
        <div className={cn("relative border-l border-line", height)}>
          {hours.map((hour) => (
            <span
              key={hour}
              aria-hidden
              className="absolute inset-x-0 border-t border-line"
              style={{ top: percent(toFraction(hour * MINUTES_PER_HOUR, window)) }}
            />
          ))}
          {/* Deadline and now lines come before the blocks, so they run through free time and pass under every
              block (and its text); the now pill is in the gutter and a deadline's label only in free time. */}
          {layout.deadlines.map((d) => (
            <span
              key={d.item.id}
              aria-hidden
              data-testid="deadline-line"
              className="pointer-events-none absolute right-0 -left-1.5 -mt-px border-t-2 border-dashed border-fg-3"
              style={{ top: percent(d.top) }}
            />
          ))}
          {nowShown ? (
            <div
              aria-hidden
              data-testid="now-line"
              className="pointer-events-none absolute right-0 -left-1 border-t-2 border-urgent"
              style={{ top: percent(layout.now!) }}
            >
              <span className="absolute -top-1.5 left-[-1px] size-2.5 rounded-full bg-urgent" />
            </div>
          ) : null}
          {nowShown ? <p className="sr-only">Now: {clockLabel(nowMinute)}</p> : null}
          <ol
            aria-label={`${label}, ${windowLabel(startHour, endHour)}`}
            className="absolute inset-0"
          >
            {entries.map((e) => e.node)}
          </ol>
        </div>
      </div>

      {layout.groups.map((g, i) => (
        <OutsideList
          key={`group-${i}`}
          heading={`At the same time, ${groupSpanLabel(g)}`}
          entries={g.blocks.map((b) => ({
            item: b.item,
            interval: b.interval,
            note: relative(b) ?? undefined,
          }))}
          timeZone={timeZone}
          className={lanesFrom(g.lanes).group}
          testId="overlap-list"
        />
      ))}
      {listedDeadlines.length > 0 ? (
        <OutsideList
          heading="Deadlines"
          icon
          entries={listedDeadlines.map((d) => ({
            item: d.item,
            interval: { start: d.minute, end: d.minute, shownEnd: d.minute, pastMidnight: false },
          }))}
          timeZone={timeZone}
          testId="deadline-list"
        />
      ) : null}
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

/** "from 8:30a" / "until 5:50p" for a block cut by the window's edges (or by midnight). */
function edgeLabel(placed: PlacedTimelineItem): string {
  return [
    placed.clippedStart ? `from ${clockLabel(placed.interval.start)}` : null,
    placed.clippedEnd ? `until ${clockLabel(placed.interval.shownEnd)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function TimelineBlock({
  placed,
  relative,
  className,
}: {
  placed: PlacedTimelineItem;
  relative: string | null;
  className?: string;
}) {
  const { item, interval } = placed;
  const isClass = item.kind === "class";
  const colors = item.code ? COURSE_COLOR_CLASSES[courseColor(item.code)] : null;
  const visibleMinutes = placed.visible.end - placed.visible.start;
  // Density: one line for short (or clipped) blocks, a single stacked column in a shared lane, else the full
  // Lakeside block. Overflow is hidden, so extra lines never spill.
  const density =
    visibleMinutes < TWO_LINE_MIN_MINUTES ? "tiny" : placed.lanes > 1 ? "narrow" : "full";
  const edge = edgeLabel(placed);
  const when = isClass ? edge : spanLabel(interval);
  const meta = [when, item.location].filter(Boolean).join(" · ");
  const spoken = [
    `${spanLabel(interval)}:`,
    item.code,
    item.title,
    item.detail,
    item.location,
    relative,
  ]
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
    <span className="block min-w-0 truncate text-sm leading-tight font-strong text-fg md:text-base">
      {item.title}
    </span>
  );
  const rel = relative ? (
    <span
      className={cn(
        "shrink-0 text-xs leading-4 font-strong whitespace-nowrap",
        colors?.text ?? "text-fg",
      )}
    >
      {relative}
    </span>
  ) : null;
  // Tags are never cut short: in a shared lane a long one wraps instead.
  const tag = !isClass ? (
    <SourceTag
      source={item.source}
      className={density === "narrow" ? "max-w-full whitespace-normal" : "shrink-0"}
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
        {/* The time and place are extras here (the list item reads them out): phones drop them, not the title. */}
        <span aria-hidden className={cn("flex min-w-0 shrink-[10]", !rel && "@max-[28rem]:hidden")}>
          {rel ??
            (meta ? <span className="truncate font-mono text-xs text-fg-2">{meta}</span> : null)}
        </span>
      </span>
    );
  } else if (density === "narrow") {
    // A shared lane (wide containers only) fits about three short lines: class → code, title, "now"/"in" note
    // (or room); event → title and its source tag.
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
  } else if (isClass) {
    // Wide containers: code and room on the first line, the title below it with the "in 1 h 18 m" note (Lakeside
    // block): the room never gives way, a long title does.
    // Phones (container < 28rem): the code and title come first and the title may wrap onto a second line; the
    // room gets its own line only when the block is tall enough for it (Lakeside home-390 drops it).
    const where = [item.location, edge].filter(Boolean).join(" · ");
    const roomFits = visibleMinutes >= ROOM_LINE_MIN_MINUTES;
    body = (
      <>
        <span aria-hidden className="hidden min-w-0 flex-col @min-[28rem]:flex">
          <span className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="shrink-0">{code}</span>
            {where ? (
              <span className="min-w-0 truncate font-mono text-xs leading-4 text-fg-2">
                {where}
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-baseline justify-between gap-3">
            {title}
            {rel}
          </span>
          {item.detail && visibleMinutes >= DETAIL_MIN_MINUTES ? (
            <span className="mt-0.5 truncate text-xs text-fg-2 md:text-sm">{item.detail}</span>
          ) : null}
        </span>
        <span aria-hidden className="flex min-w-0 flex-col @min-[28rem]:hidden" data-layout="phone">
          <span className="flex min-w-0 items-start justify-between gap-2">
            <span className="line-clamp-2 min-w-0 text-sm leading-tight font-strong break-words text-fg">
              {item.code ? (
                <span className={cn("mr-1.5 font-mono text-xs font-semibold", colors?.text)}>
                  {item.code}
                </span>
              ) : null}
              {item.title}
            </span>
            {rel}
          </span>
          {where && roomFits ? (
            <span className="mt-0.5 truncate font-mono text-xs leading-4 text-fg-2">{where}</span>
          ) : null}
        </span>
      </>
    );
  } else {
    body = (
      <span className="flex min-w-0 flex-col">
        <span aria-hidden className="flex min-w-0 items-baseline justify-between gap-3">
          {title}
          {rel}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          {tag}
          {/* A long location (WildcatSync's rain plans) ends in an ellipsis, not cut mid-line by the block. */}
          {meta ? (
            <span
              aria-hidden
              className="line-clamp-2 min-w-0 font-mono text-xs leading-4 break-words text-fg-2"
              data-testid="timeline-event-meta"
            >
              {meta}
            </span>
          ) : null}
        </span>
        {item.detail && visibleMinutes >= DETAIL_MIN_MINUTES ? (
          <span aria-hidden className="mt-0.5 line-clamp-2 text-xs text-fg-2 md:text-sm">
            {item.detail}
          </span>
        ) : null}
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
        className,
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

/** Narrow containers: one full-width block for items that share time; they are listed in full below. */
function GroupBlock({ group, className }: { group: OverlapGroup; className?: string }) {
  const when = groupSpanLabel(group);
  const count = group.blocks.length;
  return (
    <li
      data-kind="group"
      data-testid="overlap-group"
      className={cn(
        "absolute overflow-hidden rounded-md border-l-4 border-taupe bg-surface-2 px-2.5 py-1.5 text-fg",
        className,
      )}
      style={{
        top: percent(group.top),
        height: `calc(${percent(group.height)} - 2px)`,
        ...laneBox(0, 1),
      }}
    >
      <span className="sr-only">
        {when}: {count} items at the same time, listed below the timeline
      </span>
      <span aria-hidden className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="text-sm leading-tight font-strong">{count} at the same time</span>
        <span className="font-mono text-xs leading-4 text-fg-2">{when} · listed below</span>
      </span>
    </li>
  );
}

function FreeGap({ gap }: { gap: TimelineGap }) {
  return (
    <li
      className={cn(
        "absolute right-1 left-2.5 flex justify-center rounded-md border-[1.5px] border-dashed border-line-2 px-2 text-xs text-fg-3",
        gap.text === "start"
          ? "items-start pt-1.5"
          : gap.text === "end"
            ? "items-end pb-1.5"
            : "items-center",
      )}
      style={{
        top: `calc(${percent(gap.top)} + 0.25rem)`,
        height: `calc(${percent(gap.height)} - 0.5rem)`,
      }}
      data-kind="free"
    >
      {/* A deadline label fills this gap: keep the words for screen readers only. */}
      <span
        className={cn(
          "rounded-xs bg-surface px-1 font-semibold text-fg-2",
          gap.text === "hidden" && "sr-only",
        )}
      >
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
  return (
    <li
      data-source={item.source}
      data-kind="deadline"
      className="absolute inset-x-0 h-0"
      style={{ top: percent(placed.top) }}
    >
      {/* Free time above (or below) the line holds the label; the title wraps rather than being cut. */}
      <div
        data-testid="deadline-label"
        className={cn(
          "absolute left-2.5 flex w-fit max-w-[calc(100%-0.875rem)] flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm border border-line-strong bg-surface px-2 py-0.5 text-xs leading-4 shadow-card",
          placed.label === "below" ? "top-1" : "bottom-1",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Flag aria-hidden className="size-3.5 shrink-0 text-fg-2" />
          <span className="shrink-0 font-mono text-fg-2">
            <span className="sr-only">Due </span>
            {clockLabel(minute)}
          </span>
          <span className="min-w-0 font-semibold break-words text-fg" data-testid="deadline-title">
            {item.title}
          </span>
        </span>
        {item.code || item.source ? (
          <span className="flex shrink-0 items-center gap-2">
            {item.code ? <CourseCode code={item.code} /> : null}
            <SourceTag source={item.source} timeZone={timeZone} />
          </span>
        ) : null}
      </div>
    </li>
  );
}

function OutsideList({
  heading,
  entries,
  timeZone,
  icon,
  className,
  testId,
}: {
  heading: string;
  entries: { item: TimelineItem; interval?: ItemSpan; note?: string }[];
  timeZone: string;
  /** Show the deadline flag beside the heading (it matches the flags in the hour gutter). */
  icon?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("mt-3", className)} data-testid={testId}>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg-2">
        {icon ? <Flag aria-hidden className="size-3.5 shrink-0" /> : null}
        {heading}
      </p>
      <ul className="flex flex-col gap-1.5">
        {entries.map(({ item, interval, note }) => (
          <li
            key={item.id}
            data-source={item.source}
            data-kind={item.kind}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-sm"
          >
            {interval ? (
              <span className="font-mono text-xs text-fg-2">
                {item.kind === "deadline" ? <span className="sr-only">Due </span> : null}
                {spanLabel(interval)}
              </span>
            ) : null}
            {item.code ? <CourseCode code={item.code} /> : null}
            <span className="min-w-0 font-semibold break-words text-fg">{item.title}</span>
            {item.location ? <span className="text-xs text-fg-2">{item.location}</span> : null}
            {item.kind !== "class" ? <SourceTag source={item.source} timeZone={timeZone} /> : null}
            {note ? <span className="text-xs font-strong text-fg">{note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
