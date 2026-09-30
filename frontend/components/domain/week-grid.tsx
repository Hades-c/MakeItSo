"use client";

import type * as React from "react";
import { MapPin, TriangleAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_COLOR_CLASSES, courseColor } from "@/lib/course-color";
import { cn } from "@/lib/utils";
import {
  axisHours,
  clockLabel,
  percent,
  shortHourLabel,
  toFraction,
  windowFromHours,
  windowLabel,
  type Interval,
} from "./time-geometry";
import { DAY_NAMES, WEEKDAYS_ONLY, type WeekDay } from "./week-days";
import { describeBlock, layoutWeek, type PlacedBlock, type WeekGridBlock } from "./week-layout";

export type { WeekGridBlock } from "./week-layout";
export type { WeekDay } from "./week-days";

export interface WeekGridProps {
  /** Columns, in order (default Monday–Friday). A block on another day adds its column. */
  days?: readonly WeekDay[];
  /** First and last whole hour shown, e.g. 9 and 16 for 9a–4p. Blocks outside are listed under the grid. */
  startHour: number;
  endHour: number;
  blocks: readonly WeekGridBlock[];
  /** Accessible name of the week, e.g. "Your week with HIS 357". */
  label?: string;
  /** Day tab selected first on narrow layouts (e.g. today). Default: the first day with a class. */
  initialDay?: WeekDay;
  className?: string;
}

/** Height of one hour on the grid. */
const HOUR_REM = 3.25;

/**
 * Container widths from which the columns fit 12px course codes; below them the grid becomes day tabs. Static
 * strings so Tailwind generates them.
 */
const WIDE_FROM: Record<number, { wide: string; narrow: string }> = {
  5: { wide: "@min-[25rem]:block", narrow: "@min-[25rem]:hidden" },
  6: { wide: "@min-[30rem]:block", narrow: "@min-[30rem]:hidden" },
  7: { wide: "@min-[34rem]:block", narrow: "@min-[34rem]:hidden" },
};

function colorClasses(code: string) {
  return COURSE_COLOR_CLASSES[courseColor(code)];
}

function timeRange(interval: Interval & { shownEnd?: number }): string {
  return `${clockLabel(interval.start)}–${clockLabel(interval.shownEnd ?? interval.end)}`;
}

/**
 * A student's week: one column per day, classes placed by time and coloured by course. Conflicts get a danger
 * outline, an icon and a sentence under the grid; tentative sections are dashed; "Time TBA" and out-of-view
 * meetings are listed, never guessed onto the grid. In a narrow container (phones) it becomes day tabs, each a
 * list of that day's classes, so codes never shrink below 12px.
 */
export function WeekGrid({
  days = WEEKDAYS_ONLY,
  startHour,
  endHour,
  blocks,
  label = "Weekly schedule",
  initialDay,
  className,
}: WeekGridProps) {
  const window = windowFromHours(startHour, endHour);
  const layout = layoutWeek(blocks, window, days);
  const hours = axisHours(window);
  const breakpoints = WIDE_FROM[Math.min(7, Math.max(5, layout.days.length))] ?? WIDE_FROM[5]!;
  const hasTentative = blocks.some((b) => b.tentative);
  const hasConflict = blocks.some((b) => b.conflict);
  const firstBusy = layout.days.find((d) => layout.byDay[d].length > 0);
  const defaultDay =
    initialDay && layout.days.includes(initialDay) ? initialDay : (firstBusy ?? layout.days[0]!);
  const heightStyle = { height: `${(hours.length - 1) * HOUR_REM}rem` };

  return (
    <div className={cn("@container", className)} data-testid="week-grid">
      {/* Wide: the proportional grid. */}
      <div className={cn("hidden", breakpoints.wide)} data-layout="grid">
        <div
          role="group"
          aria-label={`${label}, ${windowLabel(startHour, endHour)}`}
          className="grid gap-x-1.25 gap-y-1"
          style={{ gridTemplateColumns: `1.875rem repeat(${layout.days.length}, minmax(0, 1fr))` }}
        >
          <span aria-hidden />
          {layout.days.map((day) => (
            <span key={day} aria-hidden className="pb-1 text-center font-mono text-xs text-fg-3">
              {DAY_NAMES[day].short}
            </span>
          ))}
          <div aria-hidden className="relative" style={heightStyle}>
            {hours.map((hour, i) => (
              <span
                key={hour}
                className={cn(
                  "absolute right-1 font-mono text-xs leading-none text-fg-3",
                  i === 0
                    ? "translate-y-0"
                    : i === hours.length - 1
                      ? "-translate-y-full"
                      : "-translate-y-1/2",
                )}
                style={{ top: percent(toFraction(hour * 60, window)) }}
              >
                {shortHourLabel(hour)}
              </span>
            ))}
          </div>
          {layout.days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              placed={layout.byDay[day]}
              hours={hours}
              window={window}
              style={heightStyle}
            />
          ))}
        </div>
      </div>

      {/* Narrow: one tab per day, each a list. */}
      <div className={breakpoints.narrow} data-layout="tabs">
        <Tabs defaultValue={defaultDay}>
          <TabsList aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0">
            {layout.days.map((day) => (
              <TabsTrigger key={day} value={day} className="justify-center px-1">
                <span aria-hidden>{DAY_NAMES[day].short}</span>
                <span className="sr-only">
                  {DAY_NAMES[day].long}, {countLabel(layout.byDay[day].length)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {layout.days.map((day) => (
            <TabsContent key={day} value={day} className="pt-3">
              <DayList day={day} placed={layout.byDay[day]} />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {layout.conflicts.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-danger" data-testid="week-conflicts">
          {layout.conflicts.map((sentence) => (
            <li key={sentence} className="flex items-start gap-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">Conflict: </span>
                {sentence}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {layout.tba.length > 0 ? (
        <ListedBlocks
          heading="Time TBA"
          items={layout.tba.map(({ block }) => ({ block, when: "Time TBA" }))}
        />
      ) : null}
      {layout.outside.length > 0 ? (
        <ListedBlocks
          heading={`Outside ${windowLabel(startHour, endHour)}`}
          items={layout.outside.map(({ block, day, interval }) => ({
            block,
            when: day && interval ? `${DAY_NAMES[day].short} ${timeRange(interval)}` : "",
          }))}
        />
      ) : null}

      {hasTentative || hasConflict ? (
        <ul aria-label="Key" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
          {hasTentative ? (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-xs border-[1.5px] border-dashed border-line-strong"
              />
              Tentative
            </li>
          ) : null}
          {hasConflict ? (
            <li className="flex items-center gap-1.5">
              <TriangleAlert aria-hidden className="size-3.5 text-danger" />
              Time conflict
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function countLabel(n: number): string {
  if (n === 0) return "no classes";
  return n === 1 ? "1 class" : `${n} classes`;
}

function DayColumn({
  day,
  placed,
  hours,
  window,
  style,
}: {
  day: WeekDay;
  placed: PlacedBlock[];
  hours: number[];
  window: Interval;
  style: React.CSSProperties;
}) {
  return (
    <div className="relative rounded-md bg-bg" style={style}>
      {hours.slice(1, -1).map((hour) => (
        <span
          key={hour}
          aria-hidden
          className="absolute inset-x-0 border-t border-line"
          style={{ top: percent(toFraction(hour * 60, window)) }}
        />
      ))}
      <ul aria-label={DAY_NAMES[day].long} className="absolute inset-0">
        {placed.map((p) => {
          const colors = colorClasses(p.block.code);
          const width = `calc((100% - 0.375rem) / ${p.lanes} - ${p.lanes > 1 ? "0.125rem" : "0rem"})`;
          const left = `calc(0.1875rem + (100% - 0.375rem) * ${p.lane} / ${p.lanes})`;
          return (
            <li
              key={p.block.id}
              data-course-color={courseColor(p.block.code)}
              data-conflict={p.block.conflict ? "" : undefined}
              data-tentative={p.block.tentative ? "" : undefined}
              data-lane={`${p.lane + 1}/${p.lanes}`}
              className={cn(
                "absolute min-h-5 overflow-hidden font-mono text-xs leading-4 font-semibold break-words",
                p.lanes > 1 ? "px-1 py-0.5" : "px-1.5 py-1",
                colors.chip,
                colors.border,
                p.block.tentative ? "rounded-sm border-2 border-dashed" : "rounded-sm border-l-3",
                p.clippedStart && "rounded-t-none",
                p.clippedEnd && "rounded-b-none",
                p.block.conflict && "z-10 ring-2 ring-danger ring-offset-1 ring-offset-bg",
              )}
              style={{ top: percent(p.top), height: percent(p.height), left, width }}
            >
              <span aria-hidden>{p.block.code.replace(/\s+[A-Z]$/, "")}</span>
              {/* In a shared lane there is no room for the icon: the outline and the sentence below carry it. */}
              {p.block.conflict && p.lanes === 1 ? (
                <TriangleAlert aria-hidden className="mt-0.5 block size-3.5 text-danger" />
              ) : null}
              <span className="sr-only">{describeBlock(p.block, day, p.interval)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DayList({ day, placed }: { day: WeekDay; placed: PlacedBlock[] }) {
  if (placed.length === 0) {
    return <p className="py-2 text-sm text-fg-3">No classes on {DAY_NAMES[day].long}.</p>;
  }
  return (
    <ol aria-label={DAY_NAMES[day].long} className="flex flex-col gap-2">
      {placed.map((p) => {
        const colors = colorClasses(p.block.code);
        return (
          <li
            key={p.block.id}
            data-course-color={courseColor(p.block.code)}
            className={cn(
              "flex gap-3 rounded-md px-3 py-2.5",
              colors.chip,
              colors.border,
              p.block.tentative ? "border-2 border-dashed" : "border-l-4",
              p.block.conflict && "ring-2 ring-danger ring-offset-1 ring-offset-surface",
            )}
          >
            <span className="w-24 shrink-0 font-mono text-xs leading-5 text-fg-2">
              {timeRange(p.interval)}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono text-xs leading-5 font-semibold">{p.block.code}</span>
              {p.block.title ? (
                <span className="text-sm font-semibold text-fg">{p.block.title}</span>
              ) : null}
              {p.block.room ? (
                <span className="flex items-center gap-1 text-xs text-fg-2">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  {p.block.room}
                </span>
              ) : null}
              {p.block.tentative ? <span className="text-xs text-fg-2">Tentative</span> : null}
              {p.block.conflict ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                  Time conflict
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ListedBlocks({
  heading,
  items,
}: {
  heading: string;
  items: { block: WeekGridBlock; when: string }[];
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-fg-2">{heading}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map(({ block, when }) => (
          <li key={block.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("font-mono text-xs font-semibold", colorClasses(block.code).text)}>
              {block.code}
            </span>
            {block.title ? <span className="text-fg">{block.title}</span> : null}
            {when ? <span className="font-mono text-xs text-fg-2">{when}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
