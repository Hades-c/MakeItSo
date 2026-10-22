/**
 * Plan constants without zod (lib/types/plan.ts builds its schemas from them and re-exports them), so client islands
 * can use them without carrying zod into the page.
 */

/** dropped / failed / withdrawn items are kept for history but never count and never block a re-add. */
export const PLAN_STATUSES = [
  "planned",
  "registered",
  "in-progress",
  "completed",
  "failed",
  "dropped",
  "withdrawn",
] as const;

/** Statuses that take part in the duplicate key (termCode, canonicalCode) and in credit/slot counting. */
export const ACTIVE_PLAN_STATUSES = [
  "planned",
  "registered",
  "in-progress",
  "completed",
] as const satisfies readonly (typeof PLAN_STATUSES)[number][];

/**
 * Requirement slots the tracker shows (PLAN §5 (b)–(f)): COMP writing; the seven Ways of Knowing; CULT; JEC;
 * FRLG language (or a manual proficiency/exempt toggle); PE (manual checklist: 2 Lifetime Activity + 1 Team Sport).
 */
export const REQUIREMENT_SLOTS = [
  "COMP",
  "LTRQ",
  "HTRQ",
  "SSRQ",
  "NSRQ",
  "MQRQ",
  "PRRQ",
  "VPRQ",
  "CULT",
  "JEC",
  "FRLG",
  "PE",
] as const;
