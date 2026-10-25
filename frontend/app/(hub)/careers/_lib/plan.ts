import "server-only";
import { unstable_rethrow } from "next/navigation";
import { compareTerms, termLabel, type TermCode } from "@/lib/term";
import { ACTIVE_PLAN_STATUSES, type PlanItem } from "@/lib/types/plan";
import { normalizeCourseCode } from "@/lib/types/common";
import { MissingFixtureError } from "@/server/http/fixtures";
import { ApiError } from "@/server/http/errors";
import { getPlan } from "@/server/plan";

/**
 * Each course's place in the student's plan, across all terms: the terms it is in and what it is there (so Add to
 * plan starts as "In your plan for …", and a course already taken says so instead of offering an Add). Read
 * straight from the plan service (W5s). While that service is not implemented (501) or cannot be read, the answer
 * is "unknown": null, and the page simply starts every course as not added.
 */
export type ActivePlanStatus = (typeof ACTIVE_PLAN_STATUSES)[number];

/** Per course code (listing and canonical): term → status of the active item there. */
export type PlanPresence = ReadonlyMap<string, ReadonlyMap<TermCode, ActivePlanStatus>>;

const ACTIVE = new Set<string>(ACTIVE_PLAN_STATUSES);

function isActiveStatus(status: string): status is ActivePlanStatus {
  return ACTIVE.has(status);
}

/** Terms and statuses per course code among active items (planned, registered, in progress, completed). Pure. */
export function planPresence(items: readonly PlanItem[]): PlanPresence {
  const out = new Map<string, Map<TermCode, ActivePlanStatus>>();
  for (const item of items) {
    if (!item.termCode || !isActiveStatus(item.status)) continue;
    for (const code of new Set([item.courseCode, item.canonicalCode].map(normalizeCourseCode))) {
      const terms = out.get(code) ?? new Map<TermCode, ActivePlanStatus>();
      terms.set(item.termCode, item.status);
      out.set(code, terms);
    }
  }
  return out;
}

/**
 * Where a course stands for the student (spec P10, situation before catalog): completed (the latest term), or
 * taking now (in progress, or registered for the current term), and whether it is also in the plan again after
 * that (a repeat, which credit counts once). Null when neither: the course is not taken yet and can be added.
 */
export type CourseStanding =
  | {
      kind: "completed";
      term: TermCode;
      then: { kind: "taking-now" | "planned"; term: TermCode } | null;
    }
  | { kind: "taking-now"; term: TermCode; then: { kind: "planned"; term: TermCode } | null };

export function courseStanding(
  entries: ReadonlyMap<TermCode, ActivePlanStatus> | undefined,
  currentTerm: TermCode | null,
): CourseStanding | null {
  if (!entries) return null;
  const sorted = [...entries].sort(([a], [b]) => compareTerms(a, b));
  const taking = sorted.find(
    ([term, status]) =>
      status === "in-progress" || (status === "registered" && term === currentTerm),
  )?.[0];
  const plannedAfter = (after: TermCode) =>
    sorted.find(
      ([term, status]) =>
        (status === "planned" || status === "registered") &&
        term !== taking &&
        compareTerms(term, after) > 0,
    )?.[0];
  const completed = sorted.filter(([, status]) => status === "completed").at(-1)?.[0];
  if (completed) {
    if (taking && compareTerms(taking, completed) > 0) {
      return { kind: "completed", term: completed, then: { kind: "taking-now", term: taking } };
    }
    const later = plannedAfter(completed);
    return {
      kind: "completed",
      term: completed,
      then: later ? { kind: "planned", term: later } : null,
    };
  }
  if (taking) {
    const later = plannedAfter(taking);
    return {
      kind: "taking-now",
      term: taking,
      then: later ? { kind: "planned", term: later } : null,
    };
  }
  return null;
}

/**
 * The standing in words (spec §5.10 vocabulary): "Completed Fall 2025", "Taking now (Fall 2026)", and for a
 * repeat "Completed Spring 2026 · in your Spring 2027 plan" with `warning` (shown with the warning icon).
 */
export function standingText(standing: CourseStanding): { text: string; warning: boolean } {
  const lead =
    standing.kind === "completed"
      ? `Completed ${termLabel(standing.term)}`
      : `Taking now (${termLabel(standing.term)})`;
  if (!standing.then) return { text: lead, warning: false };
  const then =
    standing.then.kind === "taking-now"
      ? `taking now (${termLabel(standing.then.term)})`
      : `in your ${termLabel(standing.then.term)} plan`;
  return { text: `${lead} · ${then}`, warning: true };
}

export async function loadPlanPresence(userId: string): Promise<PlanPresence | null> {
  try {
    return planPresence((await getPlan(userId)).items);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    // 501: the plan service is not there yet. Anything else is worth a log line; the page works either way.
    if (!(error instanceof ApiError && error.status === 501)) {
      console.error("[careers] could not read the plan:", error);
    }
    return null;
  }
}
