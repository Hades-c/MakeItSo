import { termLabel } from "@/lib/term";
import { normalizeCourseCode } from "@/lib/types/common";
import type { RequirementSlot, SlotStatus } from "@/lib/types/plan";

/**
 * Words for one WebTree choice (pure, isomorphic): which requirement slots the section could fill given the plan
 * as it is, and how much pressure its seats are under. The plan service supplies the facts (WebTreeReport
 * details: slots with their status, seats); nothing here decides a rule.
 */

/** The item filling a slot in the plan now (from the progress report's filledBy). */
export interface SlotFiller {
  courseCode: string;
  termCode: string | null;
}

export type SlotTone = "fills" | "already" | "open";

export interface SlotNote {
  slot: RequirementSlot;
  text: string;
  tone: SlotTone;
}

function where(filler: SlotFiller): string {
  return filler.termCode
    ? `${filler.courseCode}, ${termLabel(filler.termCode)}`
    : filler.courseCode;
}

/**
 * "Would fill Historical Thought" (open), "Fills Mathematical and Quantitative Thought in your plan" (this very
 * course is what fills it), "Writing already done (WRI 101, Fall 2025)", "Natural Science already planned
 * (BIO 115, Fall 2027)".
 */
export function slotNote(
  slot: RequirementSlot,
  status: SlotStatus,
  label: string,
  filler: SlotFiller | undefined,
  choice: { courseCode: string; termCode: string },
): SlotNote {
  if (status === "open") return { slot, text: `Would fill ${label}`, tone: "open" };
  if (!filler) {
    // Met without a course in the plan (the language exemption, the PE checklist).
    const state =
      status === "done"
        ? "already met"
        : status === "this-term"
          ? "in progress"
          : "already planned";
    return { slot, text: `${label} ${state}`, tone: "already" };
  }
  if (
    normalizeCourseCode(filler.courseCode) === normalizeCourseCode(choice.courseCode) &&
    filler.termCode === choice.termCode
  ) {
    return { slot, text: `Fills ${label} in your plan`, tone: "fills" };
  }
  const state =
    status === "done" ? "already done" : status === "this-term" ? "in progress" : "already planned";
  return { slot, text: `${label} ${state} (${where(filler)})`, tone: "already" };
}

export interface SeatsLike {
  current: number;
  max: number;
  remaining: number;
  overEnrolled: boolean;
  pressure: number | null;
}

export type SeatPressure = "over" | "full" | "high" | "normal" | "none";

/** Seat pressure: over-enrolled, full, high (at least 85% taken), normal, or none (no seats of its own). */
export function seatPressure(seats: SeatsLike | null): SeatPressure {
  if (!seats || seats.max <= 0) return "none";
  if (seats.overEnrolled) return "over";
  if (seats.remaining <= 0) return "full";
  if ((seats.pressure ?? 0) >= 0.85) return "high";
  return "normal";
}

export const SEAT_PRESSURE_TEXT: Readonly<Record<SeatPressure, string | null>> = {
  over: "Over-enrolled: list an alternate",
  full: "Full right now: list an alternate",
  high: "Nearly full: list an alternate",
  normal: null,
  none: null,
};
