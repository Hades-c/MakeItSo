import { TriangleAlert } from "lucide-react";
import { COURSE_COLOR_CLASSES, courseColor } from "@/lib/course-color";
import { cn } from "@/lib/utils";
import { percent } from "./time-geometry";

export interface SeatBarProps {
  /** Enrollment from the schedule API. */
  current: number;
  max: number;
  /** Seats left as the API reports them; negative when over-enrolled. */
  remaining: number;
  /** Colours the bar with the course's colour (identity only); Lake Blue otherwise. */
  courseCode?: string;
  /** lg: the course index card; sm: one line for a section row. */
  size?: "lg" | "sm";
  className?: string;
}

export type SeatState = "open" | "full" | "over-enrolled" | "no-seats";

export interface SeatSummary {
  state: SeatState;
  /** max(0, remaining) (PLAN §5). */
  open: number;
  max: number;
  enrolled: number;
  /** Bar fill, 0–1. */
  fill: number;
}

function whole(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Seat numbers as shown: open seats never go below 0; a listing with max 0 has no seats of its own. */
export function seatSummary(current: number, max: number, remaining: number): SeatSummary {
  const enrolled = Math.max(0, whole(current));
  const capacity = Math.max(0, whole(max));
  const left = whole(remaining);
  if (capacity === 0) return { state: "no-seats", open: 0, max: 0, enrolled, fill: 0 };
  const state: SeatState = left < 0 ? "over-enrolled" : left === 0 ? "full" : "open";
  return {
    state,
    open: Math.max(0, left),
    max: capacity,
    enrolled,
    fill: Math.min(1, Math.max(0, (capacity - Math.max(0, left)) / capacity)),
  };
}

/**
 * Seats for a section: "8 of 24 seats open · 16 enrolled" with a bar. Negative remaining (the API reports it)
 * reads "Over-enrolled", a full section says "Full", and a cross-listed listing with max 0 says it has no seats of
 * its own instead of showing 0 of 0.
 */
export function SeatBar({
  current,
  max,
  remaining,
  courseCode,
  size = "lg",
  className,
}: SeatBarProps) {
  const s = seatSummary(current, max, remaining);
  const fillClass =
    s.state === "over-enrolled" || s.state === "full"
      ? "bg-warning"
      : courseCode
        ? COURSE_COLOR_CLASSES[courseColor(courseCode)].fill
        : "bg-primary-fill";

  if (s.state === "no-seats") {
    return (
      <p className={cn("text-sm text-fg-2", className)} data-state={s.state}>
        No seats in this listing
        {s.enrolled > 0 ? <span className="text-fg-3"> · {s.enrolled} enrolled</span> : null}
      </p>
    );
  }

  const flag =
    s.state === "over-enrolled" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-wash px-2 py-0.5 text-xs font-semibold text-warning">
        <TriangleAlert aria-hidden className="size-3.5" />
        Over-enrolled
      </span>
    ) : s.state === "full" ? (
      <span className="inline-flex items-center rounded-full bg-warning-wash px-2 py-0.5 text-xs font-semibold text-warning">
        Full
      </span>
    ) : null;

  const bar = (
    <div
      aria-hidden
      className={cn("overflow-hidden rounded-full bg-surface-2", size === "lg" ? "h-2" : "h-1.5")}
    >
      <div className={cn("h-full rounded-full", fillClass)} style={{ width: percent(s.fill) }} />
    </div>
  );

  if (size === "sm") {
    return (
      <div className={cn("flex min-w-0 flex-col gap-1", className)} data-state={s.state}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2">
          <span>
            <span className="font-semibold text-fg">{s.open}</span> of {s.max} open
          </span>{" "}
          <span className="text-fg-3">{s.enrolled} enrolled</span>
          {flag ? <> {flag}</> : null}
        </p>
        {bar}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} data-state={s.state}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-2xl font-strong text-fg tabular-nums">{s.open}</span>{" "}
          <span className="text-sm font-medium text-fg-3">of {s.max} seats open</span>
        </span>{" "}
        <span className="flex items-center gap-2 text-sm text-fg-3">
          {flag}
          {flag ? " " : null}
          {s.enrolled} enrolled
        </span>
      </p>
      {bar}
    </div>
  );
}
