import "server-only";
import { compareTerms, type TermCode } from "@/lib/term";
import type { PlanItem, PlanStatus } from "@/lib/types/plan";

/**
 * Plan status rules that more than one page applies, so they answer the same way everywhere (the career cards
 * today; Today's headline, onboarding's guard and the repair notice next).
 *
 * A term result (completed, failed or withdrawn) recorded for the current term or a later one cannot be true yet:
 * that term is not over. v1-converted plans hold such rows (the hackathon app's add dialog defaulted to this Fall,
 * with the status set to Completed), so a page says "marked Completed, check your plan" instead of repeating the
 * impossible status, and never treats the course as taken.
 */

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

/** A term result for the current term or later (see the module comment). An item without a term never is. */
export function isUnfinishedTermResult(
  item: Pick<PlanItem, "status" | "termCode">,
  currentTerm: TermCode,
): boolean {
  return (
    item.termCode !== null &&
    isTermResult(item.status) &&
    compareTerms(item.termCode, currentTerm) >= 0
  );
}
