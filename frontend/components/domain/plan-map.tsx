import type * as React from "react";
import { StatNumber } from "@/components/ui/stat-number";
import { COURSE_COLOR_CLASSES, courseColor } from "@/lib/course-color";
import { cn } from "@/lib/utils";
import {
  groupByYear,
  layoutTerm,
  planTotals,
  share,
  type PlanCell,
  type PlanMapTerm,
  type PlanSlotStatus,
  type TermLayout,
} from "./plan-layout";
import { percent } from "./time-geometry";

export type { PlanMapSlot, PlanMapTerm, PlanSlotStatus } from "./plan-layout";

export interface PlanMapProps {
  /** Terms in order, first to last (e.g. Fall 2025 … Spring 2029, with any summers). */
  terms: readonly PlanMapTerm[];
  /** Credits needed to graduate (32 at Davidson). */
  requiredCredits: number;
  /** Slots drawn per term before it grows (default 4). */
  slotsPerTerm?: number;
  /**
   * full: totals, progress bar, the map with course codes and a key.
   * compact: a small, code-free preview (Add to plan); one row at every width.
   */
  variant?: "full" | "compact";
  /** Heading shown above the big number (full variant), e.g. <h2>Degree progress</h2>. */
  heading?: React.ReactNode;
  /** Term to emphasise in the compact preview (the one being added to). */
  highlightTermCode?: string;
  /** Accessible name for the map (default "Four-year plan"). */
  label?: string;
  className?: string;
}

const STATUS_TEXT: Record<PlanSlotStatus, string> = {
  done: "done",
  "in-progress": "in progress",
  planned: "planned",
  open: "open slot",
};

/** Container widths from which every term fits in one row with 12px codes; below them, one row per year. */
const ONE_ROW_FROM: { max: number; row: string; years: string }[] = [
  { max: 8, row: "@min-[36rem]:block", years: "@min-[36rem]:hidden" },
  { max: 10, row: "@min-[44rem]:block", years: "@min-[44rem]:hidden" },
  { max: 12, row: "@min-[52rem]:block", years: "@min-[52rem]:hidden" },
];

function cellClasses(cell: PlanCell): string {
  if (cell.status === "open") return "border-[1.5px] border-dashed border-line-2";
  if (cell.status === "done") return "bg-line-2 text-fg-2";
  const colors = cell.code ? COURSE_COLOR_CLASSES[courseColor(cell.code)] : null;
  if (cell.status === "in-progress") {
    return cn(
      "border-[1.5px]",
      colors ? cn(colors.chip, colors.border) : "border-primary bg-primary-wash text-primary",
    );
  }
  return cn(
    "border-[1.5px] border-dashed",
    colors ? cn(colors.border, colors.text) : "border-primary text-primary",
  );
}

function cellHeight(span: number, compact: boolean): string {
  const slot = compact ? 0.75 : 1.875;
  const gap = compact ? 0.1875 : 0.3125;
  return `${span * slot + (span - 1) * gap}rem`;
}

/**
 * The degree map (Lakeside): terms × credit slots. Status is shown by fill (done), wash with a solid outline (in
 * progress), dashed outline (planned) and an empty dashed slot (open), plus text for screen readers and a key;
 * hue only ever means the course. A 2-credit course spans two slots; 0-credit courses are listed, not slotted.
 * On narrow containers (phones) it becomes one row per academic year so codes stay at 12px.
 */
export function PlanMap({
  terms,
  requiredCredits,
  slotsPerTerm = 4,
  variant = "full",
  heading,
  highlightTermCode,
  label = "Four-year plan",
  className,
}: PlanMapProps) {
  const layouts = terms.map((t) => layoutTerm(t, slotsPerTerm));
  const totals = planTotals(terms, requiredCredits);
  const unslotted = layouts.flatMap((l) =>
    l.unslotted.map((slot) => ({ slot, termLabel: l.term.label })),
  );

  if (variant === "compact") {
    const highlighted = layouts.find((l) => l.term.termCode === highlightTermCode);
    const summary = [
      `${label}: ${totals.done} done`,
      `${totals.inProgress} in progress`,
      `${totals.planned} planned of ${requiredCredits} credits`,
    ].join(", ");
    return (
      <div
        role="img"
        aria-label={highlighted ? `${summary}. ${highlighted.term.label} selected.` : `${summary}.`}
        className={cn("grid gap-1", className)}
        style={{ gridTemplateColumns: `repeat(${layouts.length}, minmax(0, 1fr))` }}
        data-testid="plan-map"
      >
        {layouts.map((l) => {
          const target = l.term.termCode === highlightTermCode;
          return (
            <div key={l.term.termCode} className="flex min-w-0 flex-col gap-0.75">
              <span
                className={cn(
                  "mb-0.5 text-center font-mono text-xs leading-4",
                  target ? "font-semibold text-primary" : "text-fg-3",
                )}
              >
                {l.short}
              </span>
              {l.cells.map((cell, i) => (
                <span
                  key={i}
                  className={cn(
                    "block rounded-xs",
                    cellClasses(cell),
                    cell.status === "open" && "border",
                  )}
                  style={{ height: cellHeight(cell.span, true) }}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  const tier = ONE_ROW_FROM.find((t) => layouts.length <= t.max);
  const years = groupByYear(layouts);
  const totalsLabel = `${totals.earnedOrEarning} of ${requiredCredits} credits: ${totals.done} done, ${totals.inProgress} in progress, ${totals.planned} planned`;

  return (
    <div className={cn("@container", className)} data-testid="plan-map">
      <div className="mb-4 flex flex-col gap-4 @min-[30rem]:flex-row @min-[30rem]:items-end @min-[30rem]:justify-between">
        <div>
          {heading ? <div className="mb-1.5">{heading}</div> : null}
          <StatNumber value={totals.earnedOrEarning} label={`of ${requiredCredits} credits`} />
        </div>
        <div className="flex-1 @min-[30rem]:max-w-75">
          <div
            role="img"
            aria-label={totalsLabel}
            className="flex h-2 overflow-hidden rounded-full bg-surface-2"
          >
            <span
              className="bg-fg-3"
              style={{ width: percent(share(totals.done, requiredCredits)) }}
            />
            <span
              className="bg-primary-fill"
              style={{ width: percent(share(totals.inProgress, requiredCredits)) }}
            />
            <span
              className="bg-stripes-primary"
              style={{ width: percent(share(totals.planned, requiredCredits)) }}
            />
          </div>
          <ul
            aria-hidden
            className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-3 @min-[30rem]:justify-end"
          >
            <li className="flex items-center gap-1.25">
              <span className="size-2 rounded-[2px] bg-fg-3" />
              {totals.done} done
            </li>
            <li className="flex items-center gap-1.25">
              <span className="size-2 rounded-[2px] bg-primary-fill" />
              {totals.inProgress} in progress
            </li>
            <li className="flex items-center gap-1.25">
              <span className="size-2 rounded-[2px] bg-stripes-primary" />
              {totals.planned} planned
            </li>
          </ul>
        </div>
      </div>

      {/* One row of terms. */}
      <div className={cn("hidden", tier?.row)} data-layout="row">
        <ol
          aria-label={label}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${layouts.length}, minmax(0, 1fr))` }}
        >
          {layouts.map((l) => (
            <TermColumn key={l.term.termCode} layout={l} labelStyle="short" />
          ))}
        </ol>
      </div>

      {/* One row per academic year. */}
      <div className={tier?.years} data-layout="years">
        <ol aria-label={label} className="flex flex-col gap-3">
          {years.map((year) => (
            <li key={year.label}>
              <p className="mb-1.5 font-mono text-xs text-fg-3">{year.label}</p>
              {/* Fall | Spring side by side, a summer underneath across both; two slots per line. */}
              <ol className="grid grid-cols-2 gap-x-2 gap-y-3">
                {year.fall ? (
                  <TermColumn layout={year.fall} labelStyle="long" cellsPerRow={2} />
                ) : (
                  <li aria-hidden />
                )}
                {year.spring ? (
                  <TermColumn layout={year.spring} labelStyle="long" cellsPerRow={2} />
                ) : (
                  <li aria-hidden />
                )}
                {year.summer ? (
                  <TermColumn
                    layout={year.summer}
                    labelStyle="long"
                    cellsPerRow={4}
                    className="col-span-2"
                  />
                ) : null}
              </ol>
            </li>
          ))}
        </ol>
      </div>

      <ul aria-label="Key" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] bg-line-2" />
          Done
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-[3px] border-[1.5px] border-primary bg-primary-wash"
          />
          In progress
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-[3px] border-[1.5px] border-dashed border-primary"
          />
          Planned
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-[3px] border-[1.5px] border-dashed border-line-2"
          />
          Open
        </li>
      </ul>

      {unslotted.length > 0 ? (
        <p className="mt-3 text-xs text-fg-2" data-testid="plan-unslotted">
          <span className="font-semibold">No credit, not slotted:</span>{" "}
          {unslotted.map(({ slot, termLabel }, i) => (
            <span key={`${slot.code}-${termLabel}-${i}`}>
              {i > 0 ? "; " : null}
              <span className="font-mono font-semibold">{slot.code ?? "Course"}</span> ({termLabel},{" "}
              {STATUS_TEXT[slot.status]})
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function TermColumn({
  layout,
  labelStyle,
  cellsPerRow = 1,
  className,
}: {
  layout: TermLayout;
  labelStyle: "short" | "long";
  /** 1: a vertical stack (a 2-credit course is twice as tall); 2 or 4: a grid (it is twice as wide). */
  cellsPerRow?: 1 | 2 | 4;
  className?: string;
}) {
  const { term } = layout;
  const current = !!term.isCurrent;
  const filled = layout.cells.filter((c) => c.status !== "open");
  const stacked = cellsPerRow === 1;
  const place = (span: number): React.CSSProperties =>
    stacked
      ? { height: cellHeight(span, false) }
      : { height: cellHeight(1, false), gridColumn: `span ${Math.min(span, cellsPerRow)}` };
  return (
    <li className={cn("flex min-w-0 flex-col gap-1.25", className)} data-term={term.termCode}>
      <p
        aria-hidden
        className={cn(
          "mb-0.5 font-mono text-xs leading-4 whitespace-nowrap",
          labelStyle === "short" && "text-center",
          current ? "font-semibold text-primary" : "text-fg-3",
        )}
      >
        {labelStyle === "short" ? layout.short : term.label}
        {current ? " · now" : null}
      </p>
      <ul
        aria-label={`${term.label}${current ? ", current term" : ""}`}
        className={stacked ? "flex flex-col gap-1.25" : "grid gap-1.25"}
        style={
          stacked ? undefined : { gridTemplateColumns: `repeat(${cellsPerRow}, minmax(0, 1fr))` }
        }
      >
        {filled.map((cell, i) => (
          <li
            key={`${cell.code ?? "slot"}-${i}`}
            data-status={cell.status}
            className={cn(
              "grid min-w-0 place-items-center rounded-sm px-1 font-mono text-xs font-semibold",
              cellClasses(cell),
            )}
            style={place(cell.span)}
          >
            <span aria-hidden className="max-w-full truncate">
              {cell.code}
            </span>
            <span className="sr-only">
              {cell.code ?? "Course"}, {STATUS_TEXT[cell.status]}
              {cell.span > 1 ? `, ${cell.credits} credits` : ""}
            </span>
          </li>
        ))}
        {layout.cells
          .filter((c) => c.status === "open")
          .map((cell, i) => (
            <li
              key={`open-${i}`}
              aria-hidden
              data-status="open"
              className={cn("rounded-sm", cellClasses(cell))}
              style={place(cell.span)}
            />
          ))}
        {layout.openSlots > 0 ? (
          <li className="sr-only">
            {layout.openSlots === 1 ? "1 open slot" : `${layout.openSlots} open slots`}
          </li>
        ) : null}
      </ul>
    </li>
  );
}
