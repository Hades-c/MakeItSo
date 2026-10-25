import "server-only";
import {
  compareTerms,
  currentTermFrom,
  termPhaseFrom,
  type TermCode,
  type TermPhase,
  type TermScheduleEntry,
} from "@/lib/term";
import type { PlanItem, PlanStatus } from "@/lib/types/plan";

/**
 * Plan status rules that more than one page applies, so they answer the same way everywhere (the career cards
 * today; Today's headline, onboarding's guard and the repair notice next).
 *
 * A term result is recorded when it happens: completed and failed once the term is over, withdrawn once it has
 * begun (a W is taken during the term). One recorded before then cannot be true yet. v1-converted plans hold such
 * rows (the hackathon app's add dialog defaulted to this Fall, with the status set to Completed), so a page says
 * "marked Completed, check your plan" instead of repeating the impossible status, and never treats the course as
 * taken.
 *
 * "Over" and "begun" come from the term's own Banner dates, not from the current term: Fall 2026 stays current
 * (currentTermFrom) until Spring starts, but it is over from Dec 16, and a summer term is never current. A term the
 * list has no dates for falls back to its order against the current term: an earlier one is over, the current one
 * is in session, a later one has not begun.
 */

/**
 * What the rules judge by: the terms list with its Banner dates (resolveTerms().terms; empty when it cannot be
 * read) and the moment (server/clock `now()`).
 */
export interface TermClock {
  terms: readonly TermScheduleEntry[];
  at: Date;
}

export const TERM_RESULT_STATUSES = [
  "completed",
  "failed",
  "withdrawn",
] as const satisfies readonly PlanStatus[];
export type TermResultStatus = (typeof TERM_RESULT_STATUSES)[number];

const RESULTS = new Set<string>(TERM_RESULT_STATUSES);

export function isTermResult(status: string): status is TermResultStatus {
  return RESULTS.has(status);
}

/** Where `code` stands at the clock: by its own dates, else by its order against the current term. */
export function termPhase(code: TermCode, clock: TermClock): TermPhase {
  const dated = termPhaseFrom(clock.terms, code, { now: clock.at });
  if (dated) return dated;
  const order = compareTerms(code, currentTermFrom(clock.terms, { now: clock.at }));
  if (order < 0) return "over";
  return order === 0 ? "in-session" : "not-started";
}

/** A term result recorded before it can be true (see the module comment). An item without a term never is. */
export function isUnfinishedTermResult(
  item: Pick<PlanItem, "status" | "termCode">,
  clock: TermClock,
): boolean {
  if (item.termCode === null || !isTermResult(item.status)) return false;
  const phase = termPhase(item.termCode, clock);
  return item.status === "withdrawn" ? phase === "not-started" : phase !== "over";
}
