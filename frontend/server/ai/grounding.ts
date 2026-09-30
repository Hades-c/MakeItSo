import "server-only";
import type { TermCode } from "@/lib/term";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";
import { MAX_DROPPED_SHARE } from "@/server/ai/config";
import { cleanParagraph } from "@/server/ai/sanitize";

/**
 * Grounding of model-suggested courses (PLAN §5 "AI grounding & validation"). A suggestion is kept only when
 *   (1) its code is one of the server's candidates (the candidates were retrieved from the catalog: a section in
 *       the target term, or for an unpublished term an offering in one of the last 4 regular terms),
 *   (2) its term is one the candidate may be taken in,
 *   (3) it is not completed or planned already (cross-listed siblings count as the same course) and not a
 *       repeat of an earlier suggestion.
 * Restriction flags travel with the candidate (they flag, never block). More than 30% of the suggestions dropped
 * makes the whole answer invalid (the caller retries once, never caches it, and logs it with the promptVersion).
 */

export type Basis = "scheduled" | "past-offerings";

export interface GroundingCandidate {
  courseCode: string;
  /** Cross-listing canonical code (canonicalCourseCode). */
  canonical: string;
  /** Sibling listing codes (a pick of a sibling maps to this candidate). */
  siblings: readonly string[];
  /** Terms the course may be suggested for, with the basis the draft item is labelled with. */
  terms: ReadonlyMap<TermCode, Basis>;
}

export interface ModelPick {
  courseCode: string;
  termCode: string;
  why: string;
}

export interface GroundedItem {
  termCode: TermCode;
  courseCode: string;
  reason: string;
  basis: Basis;
}

export interface DroppedPick {
  courseCode: string;
  termCode: string;
  problem: "not-a-course-code" | "not-a-candidate" | "wrong-term" | "already-in-plan" | "duplicate";
}

export interface GroundingResult {
  items: GroundedItem[];
  dropped: DroppedPick[];
  /** dropped / returned (0 when nothing was returned). */
  droppedShare: number;
  /** More than MAX_DROPPED_SHARE dropped, or nothing usable left. */
  invalid: boolean;
}

export interface GroundingOptions<C extends GroundingCandidate = GroundingCandidate> {
  /** Canonical and listing codes of the student's active plan items. */
  taken: ReadonlySet<string>;
  maxItems: number;
  /** Reason text when the model's "why" is empty after cleaning. */
  fallbackReason: (candidate: C) => string;
}

/** Index candidates by their own code and every sibling code. */
export function candidateIndex<C extends GroundingCandidate>(
  candidates: readonly C[],
): Map<string, C> {
  const index = new Map<string, C>();
  for (const candidate of candidates) {
    index.set(candidate.courseCode, candidate);
    for (const sibling of candidate.siblings) {
      if (!index.has(sibling)) index.set(sibling, candidate);
    }
  }
  return index;
}

export const REASON_MAX_LENGTH = 300;

export function groundPicks<C extends GroundingCandidate>(
  picks: readonly ModelPick[],
  candidates: readonly C[],
  options: GroundingOptions<C>,
): GroundingResult {
  const index = candidateIndex(candidates);
  const items: GroundedItem[] = [];
  const dropped: DroppedPick[] = [];
  const seen = new Set<string>();

  for (const pick of picks) {
    const code = normalizeCourseCode(pick.courseCode);
    const termCode = pick.termCode.trim();
    const drop = (problem: DroppedPick["problem"]) =>
      dropped.push({
        courseCode: pick.courseCode.slice(0, 20),
        termCode: termCode.slice(0, 10),
        problem,
      });
    if (!COURSE_CODE_PATTERN.test(code)) {
      drop("not-a-course-code");
      continue;
    }
    const candidate = index.get(code);
    if (!candidate) {
      drop("not-a-candidate");
      continue;
    }
    const basis = candidate.terms.get(termCode);
    if (!basis) {
      drop("wrong-term");
      continue;
    }
    if (
      options.taken.has(candidate.canonical) ||
      options.taken.has(candidate.courseCode) ||
      candidate.siblings.some((sibling) => options.taken.has(sibling))
    ) {
      drop("already-in-plan");
      continue;
    }
    if (seen.has(candidate.canonical)) {
      drop("duplicate");
      continue;
    }
    seen.add(candidate.canonical);
    if (items.length >= options.maxItems) continue;
    const reason = cleanParagraph(pick.why, REASON_MAX_LENGTH) || options.fallbackReason(candidate);
    items.push({ termCode, courseCode: candidate.courseCode, reason, basis });
  }

  const droppedShare = picks.length === 0 ? 0 : dropped.length / picks.length;
  return {
    items,
    dropped,
    droppedShare,
    invalid: droppedShare > MAX_DROPPED_SHARE || items.length === 0,
  };
}
