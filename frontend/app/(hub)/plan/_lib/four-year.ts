import type { PlanMapSlot, PlanMapTerm } from "@/components/domain/plan-map";
import type { RequirementSlot as SlotView } from "@/components/domain/requirement-slots";
import { compareTerms, isSummer, termLabel, type TermCode } from "@/lib/term";
import { canonicalCourseCode } from "@/lib/types/catalog";
import { normalizeCourseCode } from "@/lib/types/common";
import {
  ACTIVE_PLAN_STATUSES,
  REQUIREMENT_SLOTS,
  type PlanItem,
  type PlanProgress,
  type PlanStatus,
  type PlanWarning,
  type RequirementSlot,
} from "@/lib/types/plan";

/**
 * The 4-year plan tab's view model (pure, isomorphic): items per term, the degree map, the requirement tracker
 * tiles, retakes and the per-item warnings. The plan service owns every rule (credits, matching, warnings); this
 * module only arranges what it returns.
 */

const ACTIVE: ReadonlySet<PlanStatus> = new Set(ACTIVE_PLAN_STATUSES);

export function isActive(item: Pick<PlanItem, "status">): boolean {
  return ACTIVE.has(item.status);
}

export interface TermGroup {
  termCode: TermCode;
  label: string;
  items: PlanItem[];
  isCurrent: boolean;
  isRegistration: boolean;
  /** Credits of the term's active items. */
  credits: number;
}

export interface PlanGroups {
  /** Pre-matriculation credit (AP/transfer) without a term. */
  beforeDavidson: PlanItem[];
  terms: TermGroup[];
  /** Items whose term is outside the plan's range (kept, shown, movable). */
  outside: TermGroup[];
}

function creditsOf(items: readonly PlanItem[]): number {
  return items.filter(isActive).reduce((sum, item) => sum + item.credits, 0);
}

/** Items in plan order: active first, then by code; inactive history after. */
function sortItems(items: readonly PlanItem[]): PlanItem[] {
  return [...items].sort(
    (a, b) =>
      Number(!isActive(a)) - Number(!isActive(b)) || a.courseCode.localeCompare(b.courseCode),
  );
}

/**
 * Items grouped by term over the plan's range (every regular term, plus a summer only when it holds items), then
 * the terms outside the range that hold items.
 */
export function groupByTerm(
  items: readonly PlanItem[],
  planTerms: readonly TermCode[],
  current: TermCode,
  registration: TermCode,
): PlanGroups {
  const byTerm = new Map<string, PlanItem[]>();
  const beforeDavidson: PlanItem[] = [];
  for (const item of items) {
    if (item.termCode === null) {
      beforeDavidson.push(item);
      continue;
    }
    byTerm.set(item.termCode, [...(byTerm.get(item.termCode) ?? []), item]);
  }
  const inRange = new Set(planTerms);
  const group = (termCode: TermCode): TermGroup => {
    const termItems = sortItems(byTerm.get(termCode) ?? []);
    return {
      termCode,
      label: termLabel(termCode),
      items: termItems,
      isCurrent: termCode === current,
      isRegistration: termCode === registration,
      credits: creditsOf(termItems),
    };
  };
  const terms = planTerms
    .filter((termCode) => !isSummer(termCode) || (byTerm.get(termCode)?.length ?? 0) > 0)
    .map(group);
  const outside = [...byTerm.keys()]
    .filter((termCode) => !inRange.has(termCode))
    .sort(compareTerms)
    .map(group);
  return { beforeDavidson: sortItems(beforeDavidson), terms, outside };
}

function mapSlot(item: PlanItem): PlanMapSlot | null {
  switch (item.status) {
    case "completed":
      return { status: "done", code: item.courseCode, credits: item.credits };
    case "registered":
    case "in-progress":
      return { status: "in-progress", code: item.courseCode, credits: item.credits };
    case "planned":
      return { status: "planned", code: item.courseCode, credits: item.credits };
    default:
      return null;
  }
}

/** PlanMap terms: one per group, active items only (failed, dropped and withdrawn never fill a slot). */
export function planMapTerms(groups: PlanGroups): PlanMapTerm[] {
  return [...groups.terms, ...groups.outside]
    .sort((a, b) => compareTerms(a.termCode, b.termCode))
    .map((group) => ({
      termCode: group.termCode,
      label: group.label,
      isCurrent: group.isCurrent,
      slots: group.items.map(mapSlot).filter((slot): slot is PlanMapSlot => slot !== null),
    }));
}

/** How the tracker writes each slot's code (students know "Writing" and "Language" by those words). */
export const SLOT_CODE_TEXT: Readonly<Record<RequirementSlot, string>> = {
  COMP: "Writing",
  LTRQ: "LTRQ",
  HTRQ: "HTRQ",
  SSRQ: "SSRQ",
  NSRQ: "NSRQ",
  MQRQ: "MQRQ",
  PRRQ: "PRRQ",
  VPRQ: "VPRQ",
  CULT: "CULT",
  JEC: "JEC",
  FRLG: "Language",
  PE: "PE",
};

function termText(item: PlanItem): string {
  return item.termCode ? termLabel(item.termCode) : "before Davidson";
}

/** RequirementSlots tiles from the progress report: status per slot and the first item filling it. */
export function requirementTiles(
  progress: Pick<PlanProgress, "reqs" | "filledBy">,
  items: readonly PlanItem[],
  labels: Readonly<Record<RequirementSlot, string>>,
): SlotView[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return REQUIREMENT_SLOTS.map((slot) => {
    const filler = (progress.filledBy[slot] ?? [])
      .map((id) => byId.get(id))
      .find((item): item is PlanItem => item !== undefined);
    return {
      id: slot.toLowerCase(),
      code: SLOT_CODE_TEXT[slot],
      label: labels[slot],
      status: progress.reqs[slot],
      course: filler ? { code: filler.courseCode, termLabel: termText(filler) } : undefined,
    };
  });
}

function sameCourse(a: PlanItem, b: PlanItem): boolean {
  return (
    canonicalCourseCode(a.canonicalCode) === canonicalCourseCode(b.canonicalCode) ||
    normalizeCourseCode(a.courseCode) === normalizeCourseCode(b.courseCode)
  );
}

/**
 * The earlier completed item of the same course, for "Already completed in Fall 2025 — plan a retake?" on a
 * later planned item. Never a reason to block (retakes, ensembles, topics courses repeat).
 */
export function earlierCompletion(item: PlanItem, items: readonly PlanItem[]): PlanItem | null {
  if (item.status !== "planned" && item.status !== "registered") return null;
  const earlier = items
    .filter(
      (other) =>
        other.id !== item.id &&
        other.status === "completed" &&
        sameCourse(other, item) &&
        (other.termCode === null ||
          item.termCode === null ||
          compareTerms(other.termCode, item.termCode) < 0),
    )
    .sort((a, b) => (a.termCode ?? "").localeCompare(b.termCode ?? ""));
  return earlier.pop() ?? null;
}

/** "Already completed in Fall 2025 — plan a retake?" */
export function retakeNote(earlier: PlanItem): string {
  return earlier.termCode
    ? `Already completed in ${termLabel(earlier.termCode)} — plan a retake?`
    : "Already counted as AP/transfer credit — plan a retake?";
}

/** A course that can be retaken from its row: completed or failed (dropped/withdrawn are simply re-added). */
export function canRetake(item: PlanItem): boolean {
  return item.status === "completed" || item.status === "failed";
}

/**
 * Terms a retake can go to: after the item's own term, inside the plan, not one that already has the course
 * active. The first is the default.
 */
export function retakeTerms(
  item: PlanItem,
  items: readonly PlanItem[],
  planTerms: readonly TermCode[],
  registration: TermCode,
): TermCode[] {
  const taken = new Set(
    items
      .filter((other) => isActive(other) && other.termCode && sameCourse(other, item))
      .map((other) => other.termCode!),
  );
  return planTerms.filter(
    (termCode) =>
      compareTerms(termCode, registration) >= 0 &&
      (item.termCode === null || compareTerms(termCode, item.termCode) > 0) &&
      !taken.has(termCode),
  );
}

/** Warnings about one item (P/F limits, restrictions, unverified codes), from the progress report. */
export function warningsFor(warnings: readonly PlanWarning[], itemId: string): PlanWarning[] {
  return warnings.filter((warning) => warning.itemId === itemId);
}

/** Plan-wide warnings (not tied to one item), deduplicated by message. */
export function generalWarnings(warnings: readonly PlanWarning[]): PlanWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    if (warning.itemId || seen.has(warning.message)) return false;
    seen.add(warning.message);
    return true;
  });
}

/** Elected P/F among active items, total and per term (the engine warns at > 3 total or > 1 per term). */
export function passFailCounts(items: readonly PlanItem[]): {
  total: number;
  byTerm: Map<string, number>;
} {
  const byTerm = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    if (!item.passFail || !isActive(item)) continue;
    total += 1;
    const key = item.termCode ?? "none";
    byTerm.set(key, (byTerm.get(key) ?? 0) + 1);
  }
  return { total, byTerm };
}

/** The legacy-plan note for an item converted from the hackathon plan that the catalog could not confirm. */
export const NOT_IN_CATALOG = "Not found in the Davidson catalog — edit or remove";

/** Lifetime Activity courses the PE checklist counts (2 needed). */
export const PE_LIFETIME_REQUIRED = 2;
