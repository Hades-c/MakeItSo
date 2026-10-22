import "server-only";
import type { PlanMapSlot, PlanMapTerm, PlanSlotStatus } from "@/components/domain/plan-map";
import {
  compareTerms,
  isTermCode,
  termCodeFor,
  termLabel,
  termsBetween,
  type TermCode,
} from "@/lib/term";
import type { PlanItem, PlanStatus } from "@/lib/types/plan";

/**
 * The degree map on Today (PLAN §3: 8 terms × credit slots, the compact Lakeside PlanMap): the student's plan items
 * per term, from the first term at Davidson through the graduation spring (summers included; the compact map
 * leaves out the empty ones). A term outside that range that holds items widens it. Dropped, failed and withdrawn
 * items take no slot. Pure.
 */

const SLOT_STATUS: Partial<Record<PlanStatus, PlanSlotStatus>> = {
  completed: "done",
  "in-progress": "in-progress",
  registered: "in-progress",
  planned: "planned",
};

const STATUS_ORDER: Record<PlanSlotStatus, number> = {
  done: 0,
  "in-progress": 1,
  planned: 2,
  open: 3,
};

export interface DegreeMapInput {
  items: readonly PlanItem[];
  firstTerm: TermCode;
  graduationYear: number;
  currentTerm: TermCode | null;
}

/** The graduation spring: Spring <graduationYear> (term code <graduationYear − 1>02). */
function graduationSpring(graduationYear: number): TermCode | null {
  try {
    return termCodeFor("Spring", graduationYear);
  } catch {
    return null;
  }
}

export function degreeMapTerms(input: DegreeMapInput): PlanMapTerm[] {
  const slotted = input.items.filter(
    (item): item is PlanItem & { termCode: TermCode } =>
      item.termCode !== null && isTermCode(item.termCode) && SLOT_STATUS[item.status] !== undefined,
  );
  let first = input.firstTerm;
  let last = graduationSpring(input.graduationYear) ?? first;
  if (compareTerms(last, first) < 0) last = first;
  for (const item of slotted) {
    if (compareTerms(item.termCode, first) < 0) first = item.termCode;
    if (compareTerms(item.termCode, last) > 0) last = item.termCode;
  }
  return termsBetween(first, last, { includeSummer: true }).map((termCode) => {
    const slots: PlanMapSlot[] = slotted
      .filter((item) => item.termCode === termCode)
      .map((item) => ({
        status: SLOT_STATUS[item.status] as PlanSlotStatus,
        code: item.courseCode,
        credits: item.credits,
      }))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          (a.code ?? "").localeCompare(b.code ?? ""),
      );
    return {
      termCode,
      label: termLabel(termCode),
      slots,
      ...(termCode === input.currentTerm ? { isCurrent: true } : {}),
    };
  });
}
