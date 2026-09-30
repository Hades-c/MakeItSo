import type * as React from "react";
import { Info } from "lucide-react";
import { COURSE_COLOR_CLASSES, courseColor } from "@/lib/course-color";
import { cn } from "@/lib/utils";

export type RequirementStatus = "done" | "this-term" | "planned" | "open";

export interface RequirementSlot {
  id: string;
  /** Official name, e.g. "Historical Thought" (read to screen readers next to the code). */
  label: string;
  /** Short code as students see it, e.g. "HTRQ", "Writing", "Language". */
  code: string;
  status: RequirementStatus;
  /** The course filling (or planned to fill) the slot. */
  course?: { code: string; termLabel: string };
}

export interface RequirementSlotsProps {
  slots: readonly RequirementSlot[];
  /**
   * Course being considered (course page, "What it fills in your plan"): slots whose course has this code are
   * highlighted as "HIS 357 fills".
   */
  candidate?: string;
  /** Extra text after the fixed "Unofficial — verify in Degree Works" note. */
  note?: React.ReactNode;
  /** Accessible name of the list (default "Requirements"). */
  label?: string;
  className?: string;
}

const STATUS_TEXT: Record<RequirementStatus, string> = {
  done: "done",
  "this-term": "this term",
  planned: "planned",
  open: "open",
};

const TILE: Record<RequirementStatus, string> = {
  done: "bg-surface-2 text-fg-3",
  "this-term": "bg-primary-wash text-primary",
  planned: "border-[1.5px] border-dashed border-primary text-primary",
  open: "border-[1.5px] border-dashed border-line-2 text-fg-3",
};

function subText(slot: RequirementSlot, isCandidate: boolean, candidate?: string): string {
  if (isCandidate) return `${candidate} fills`;
  switch (slot.status) {
    case "done":
      return slot.course ? `Done · ${slot.course.code}` : "Done";
    case "this-term":
      return slot.course?.code ?? "This term";
    case "planned":
      return slot.course ? `${slot.course.code} · ${slot.course.termLabel}` : "Planned";
    case "open":
      return "Open";
  }
}

/**
 * Requirement slots (Ways of Knowing, CULT, JEC, Writing, Language): what is done, in progress this term,
 * planned or still open, with the course that fills each. Status is carried by fill / wash / dashed outline and
 * a key, and read out in words; course hue appears only on the candidate course. Always states that it is
 * unofficial (PLAN §5).
 */
export function RequirementSlots({
  slots,
  candidate,
  note,
  label = "Requirements",
  className,
}: RequirementSlotsProps) {
  const candidateColors = candidate ? COURSE_COLOR_CLASSES[courseColor(candidate)] : null;
  const isCandidate = (slot: RequirementSlot) =>
    !!candidate && slot.course?.code === candidate && slot.status !== "done";
  const present = new Set(slots.map((s) => s.status));
  const anyCandidate = slots.some(isCandidate);

  return (
    <div className={cn("@container", className)} data-testid="requirement-slots">
      <ul aria-label={label} className="grid grid-cols-2 gap-2 @min-[32rem]:grid-cols-5">
        {slots.map((slot) => {
          const highlight = isCandidate(slot);
          return (
            <li
              key={slot.id}
              data-status={highlight ? "candidate" : slot.status}
              className={cn(
                "flex min-w-0 items-center justify-between gap-2 rounded-md px-2.5 py-2.25",
                "@min-[32rem]:min-h-16.5 @min-[32rem]:flex-col @min-[32rem]:items-start @min-[32rem]:gap-1.5 @min-[32rem]:pt-2.5 @min-[32rem]:pb-2.25",
                highlight && candidateColors
                  ? cn("border-2", candidateColors.border, candidateColors.chip)
                  : TILE[slot.status],
              )}
            >
              <span className="font-mono text-xs font-semibold">
                {slot.code}
                <span className="sr-only"> ({slot.label})</span>
              </span>
              <span
                className={cn(
                  "min-w-0 text-right text-xs leading-tight @min-[32rem]:text-left",
                  highlight && "font-strong",
                )}
              >
                <span className="sr-only">
                  {highlight ? "would be filled" : STATUS_TEXT[slot.status]}:{" "}
                </span>
                {subText(slot, highlight, candidate)}
              </span>
            </li>
          );
        })}
      </ul>

      <ul aria-label="Key" className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-fg-3">
        {present.has("done") ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-surface-2 ring-1 ring-line-2" />
            Done
          </li>
        ) : null}
        {present.has("this-term") ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px] bg-primary-wash ring-1 ring-primary"
            />
            This term
          </li>
        ) : null}
        {present.has("planned") ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px] border-[1.5px] border-dashed border-primary"
            />
            Planned
          </li>
        ) : null}
        {anyCandidate && candidateColors ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-2.5 rounded-[3px] border-2",
                candidateColors.border,
                candidateColors.chip,
              )}
            />
            Filled by {candidate}
          </li>
        ) : null}
        {present.has("open") ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px] border-[1.5px] border-dashed border-line-2"
            />
            Open
          </li>
        ) : null}
      </ul>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-3">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          <span className="font-semibold text-fg-2">Unofficial — verify in Degree Works.</span>
          {note ? <> {note}</> : null}
        </span>
      </p>
    </div>
  );
}
