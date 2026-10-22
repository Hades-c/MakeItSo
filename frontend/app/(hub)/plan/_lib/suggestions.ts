import { compareTerms, termLabel, type TermCode } from "@/lib/term";
import { normalizeCourseCode } from "@/lib/types/common";
import { ACTIVE_PLAN_STATUSES, type PlanDraft, type PlanItem } from "@/lib/types/plan";

/**
 * AI suggestion drafts, arranged for the Suggestions tab (pure, isomorphic). PLAN §6.1 W5s: "draft items already
 * in the plan are ticked off per course, never per term" — so every term of a draft is always listed, and each
 * course in it is pending, in the plan, or set aside by the student.
 */

export type SuggestionState = "pending" | "in-plan" | "rejected";

export interface SuggestionRow {
  key: string;
  termCode: TermCode;
  courseCode: string;
  reason: string;
  /** "Not yet scheduled — based on past offerings" when the term is not published. */
  basisNote: string | null;
  state: SuggestionState;
}

export interface SuggestionTerm {
  termCode: TermCode;
  label: string;
  rows: SuggestionRow[];
}

export const PAST_OFFERINGS_NOTE = "Not yet scheduled — based on past offerings";

/** Key of one suggested course in one term. */
export function suggestionKey(draftId: string, termCode: string, courseCode: string): string {
  return `${draftId}:${termCode}:${normalizeCourseCode(courseCode)}`;
}

/** (term, code) pairs of active plan items, by listing and canonical code. */
export function activeTermCodes(items: readonly PlanItem[]): Set<string> {
  const active = new Set<string>(ACTIVE_PLAN_STATUSES);
  const out = new Set<string>();
  for (const item of items) {
    if (!item.termCode || !active.has(item.status)) continue;
    out.add(`${item.termCode}:${normalizeCourseCode(item.courseCode)}`);
    out.add(`${item.termCode}:${normalizeCourseCode(item.canonicalCode)}`);
  }
  return out;
}

/**
 * One draft's terms in order, each with all of its courses. A course is "in-plan" when the plan has it active in
 * that term, "rejected" when the student set it aside (`rejected` keys), else "pending". A term whose courses are
 * all handled is still listed.
 */
export function draftTerms(
  draft: PlanDraft,
  items: readonly PlanItem[],
  rejected: ReadonlySet<string>,
): SuggestionTerm[] {
  const inPlan = activeTermCodes(items);
  const terms = new Map<string, SuggestionRow[]>();
  for (const entry of draft.items) {
    const key = suggestionKey(draft.id, entry.termCode, entry.courseCode);
    const state: SuggestionState = inPlan.has(
      `${entry.termCode}:${normalizeCourseCode(entry.courseCode)}`,
    )
      ? "in-plan"
      : rejected.has(key)
        ? "rejected"
        : "pending";
    const rows = terms.get(entry.termCode) ?? [];
    if (rows.some((row) => row.key === key)) continue;
    rows.push({
      key,
      termCode: entry.termCode,
      courseCode: normalizeCourseCode(entry.courseCode),
      reason: entry.reason,
      basisNote: entry.basis === "past-offerings" ? PAST_OFFERINGS_NOTE : null,
      state,
    });
    terms.set(entry.termCode, rows);
  }
  return [...terms.entries()]
    .sort(([a], [b]) => compareTerms(a, b))
    .map(([termCode, rows]) => ({ termCode, label: termLabel(termCode), rows }));
}

/** Every course of the draft handled (in the plan or set aside): the draft can be closed. */
export function allHandled(terms: readonly SuggestionTerm[]): boolean {
  return terms.every((term) => term.rows.every((row) => row.state !== "pending"));
}

/**
 * The status to store once every course is handled. Accepting a draft on the server adds every course not yet in
 * the plan, so it is "accepted" only when every course is already in the plan (nothing more gets added), and
 * "dismissed" as soon as one was set aside. Courses already added stay in the plan either way.
 */
export function closingStatus(terms: readonly SuggestionTerm[]): "accepted" | "dismissed" {
  const rows = terms.flatMap((term) => term.rows);
  return rows.length > 0 && rows.every((row) => row.state === "in-plan") ? "accepted" : "dismissed";
}

/** Pending drafts first (newest first), then the rest. */
export function orderDrafts(drafts: readonly PlanDraft[]): PlanDraft[] {
  return [...drafts].sort(
    (a, b) =>
      Number(a.status !== "pending") - Number(b.status !== "pending") ||
      b.createdAt.localeCompare(a.createdAt),
  );
}
