import "server-only";
import { unstable_rethrow } from "next/navigation";
import { STATUS_LABELS } from "@/app/(hub)/plan/_lib/labels";
import { routes } from "@/lib/routes";
import { compareTerms, termLabel, type TermCode } from "@/lib/term";
import { ACTIVE_PLAN_STATUSES, type PlanItem } from "@/lib/types/plan";
import { normalizeCourseCode } from "@/lib/types/common";
import { MissingFixtureError } from "@/server/http/fixtures";
import { ApiError } from "@/server/http/errors";
import { getPlan } from "@/server/plan";
import {
  isTermResult,
  isUnfinishedTermResult,
  type TermResultStatus,
} from "@/server/plan/status-rules";

/**
 * Each course's place in the student's plan, across all terms: the terms it is in and what it is there (so Add to
 * plan starts as "In your plan for …", and a course already taken says so instead of offering an Add). Read
 * straight from the plan service (W5s). While that service is not implemented (501) or cannot be read, the answer
 * is "unknown": null, and the page simply starts every course as not added.
 */
export type ActivePlanStatus = (typeof ACTIVE_PLAN_STATUSES)[number];

/**
 * What a term holds for a course: an active item's status, or "failed" / "withdrawn" (kept only so a result
 * recorded for a term that is not over can be flagged; they never put the course in the plan).
 */
export type PresenceStatus = ActivePlanStatus | Exclude<TermResultStatus, "completed">;

/** Per course code (listing and canonical): term → status of the item there (an active one wins). */
export type PlanPresence = ReadonlyMap<string, ReadonlyMap<TermCode, PresenceStatus>>;

const ACTIVE = new Set<string>(ACTIVE_PLAN_STATUSES);

function isActiveStatus(status: string): status is ActivePlanStatus {
  return ACTIVE.has(status);
}

/**
 * Terms and statuses per course code: active items (planned, registered, in progress, completed), and failed or
 * withdrawn items where the term has no active one. Dropped items and items without a term are left out. Pure.
 */
export function planPresence(items: readonly PlanItem[]): PlanPresence {
  const out = new Map<string, Map<TermCode, PresenceStatus>>();
  for (const item of items) {
    const status = item.status;
    if (!item.termCode || !(isActiveStatus(status) || isTermResult(status))) continue;
    for (const code of new Set([item.courseCode, item.canonicalCode].map(normalizeCourseCode))) {
      const terms = out.get(code) ?? new Map<TermCode, PresenceStatus>();
      const held = terms.get(item.termCode);
      if (isActiveStatus(status) || !held || !isActiveStatus(held)) {
        terms.set(item.termCode, status);
      }
      out.set(code, terms);
    }
  }
  return out;
}

/** The terms a course is in the plan for (active items only): Add to plan's "In your plan for …". */
export function plannedTerms(
  entries: ReadonlyMap<TermCode, PresenceStatus> | undefined,
): TermCode[] {
  return [...(entries ?? [])].flatMap(([term, status]) => (isActiveStatus(status) ? [term] : []));
}

/**
 * Where a course stands for the student (spec P10, situation before catalog):
 *   - marked: its latest term result (completed, failed or withdrawn) is for the current term or later, which
 *     cannot be true yet (server/plan/status-rules.ts): the plan needs checking, and the course is neither taken
 *     nor offered an Add;
 *   - completed (the latest term), or taking now (in progress, or registered for the current term), and whether it
 *     is also in the plan again after that (a repeat, which credit counts once).
 * Null when none of these: the course is not taken yet and can be added. Failed and withdrawn items in past terms
 * are history and change nothing. Without a current term, nothing is flagged as marked.
 */
export type CourseStanding =
  | { kind: "marked"; term: TermCode; status: TermResultStatus }
  | {
      kind: "completed";
      term: TermCode;
      then: { kind: "taking-now" | "planned"; term: TermCode } | null;
    }
  | { kind: "taking-now"; term: TermCode; then: { kind: "planned"; term: TermCode } | null };

export function courseStanding(
  entries: ReadonlyMap<TermCode, PresenceStatus> | undefined,
  currentTerm: TermCode | null,
): CourseStanding | null {
  if (!entries) return null;
  const sorted = [...entries].sort(([a], [b]) => compareTerms(a, b));
  const result = sorted.filter(([, status]) => isTermResult(status)).at(-1);
  if (
    result &&
    currentTerm &&
    isUnfinishedTermResult({ status: result[1], termCode: result[0] }, currentTerm)
  ) {
    return { kind: "marked", term: result[0], status: result[1] as TermResultStatus };
  }
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

/** A standing in words; `check` is the link that ends the marked state's sentence ("check your plan"). */
export interface StandingText {
  text: string;
  warning: boolean;
  check?: { words: string; href: string };
}

/** The link words that end the marked state's sentence. */
export const CHECK_YOUR_PLAN = "check your plan";

/**
 * The standing in words (spec §5.10 vocabulary): "Completed Fall 2025", "Taking now (Fall 2026)"; with `warning`
 * (the warning icon and colour, spec §5.6) a repeat, "Completed Spring 2026 · in your Spring 2027 plan", and a
 * result marked too early, "In your Fall 2026 plan · marked Completed, check your plan", whose last words link the
 * 4-year plan, where the row is fixed.
 */
export function standingText(standing: CourseStanding): StandingText {
  if (standing.kind === "marked") {
    return {
      text: `In your ${termLabel(standing.term)} plan · marked ${STATUS_LABELS[standing.status]}, ${CHECK_YOUR_PLAN}`,
      warning: true,
      check: { words: CHECK_YOUR_PLAN, href: routes.plan("four-year") },
    };
  }
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
