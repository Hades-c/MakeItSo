import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { compareTerms, nextRegularTerm, termLabel, type TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";
import { usuallyOfferedText } from "./format";

/**
 * Which terms "Add to <term>" offers and what each says (PLAN §3, §5 "Availability"). Pure.
 *
 * The plan window is the current term (a class the student is taking now; added as in-progress), the registration
 * term (the default) and the regular term after it (never published yet: "Not yet published", with "usually
 * offered" when the history supports it). A term the history does not report is left out, never guessed.
 */

export interface PlanWindow {
  current: TermCode;
  registration: TermCode;
}

/** current, registration and the term after registration, without duplicates, in order. */
export function planWindowTerms(window: PlanWindow): TermCode[] {
  return [...new Set([window.current, window.registration, nextRegularTerm(window.registration)])];
}

/** AddToPlanControl terms from a course's availability. */
export function addToPlanTerms(
  history: readonly Availability[],
  window: PlanWindow,
): AddToPlanTerm[] {
  const byTerm = new Map(history.map((entry) => [entry.termCode, entry]));
  const out: AddToPlanTerm[] = [];
  for (const code of planWindowTerms(window)) {
    const entry = byTerm.get(code);
    if (!entry) continue;
    const term: AddToPlanTerm = { code, label: termLabel(code), availability: entry.status };
    if (entry.status === "offered" && entry.sectionCount !== undefined) {
      term.sectionCount = entry.sectionCount;
    }
    if (entry.status === "not-yet-published" && entry.usually) {
      term.note = `Usually ${entry.usually.season}`;
    }
    out.push(term);
  }
  return out;
}

/** The unpublished term's full "usually offered" sentence, naming the term, or null. */
export function unpublishedNote(
  history: readonly Availability[],
  window: PlanWindow,
): string | null {
  const next = nextRegularTerm(window.registration);
  const entry = history.find((item) => item.termCode === next);
  const usually = entry ? usuallyOfferedText(entry) : null;
  return usually ? `${termLabel(next)} isn’t published yet. ${usually}.` : null;
}

/**
 * The term the control starts on: `preferred` (the page's or search's term) when it can be chosen, else the
 * registration term, else the unpublished next term, else none. The current term is chosen only when it is the
 * preferred term (adding there records a class the student is taking now).
 */
export function defaultAddTerm(
  choices: readonly AddToPlanTerm[],
  window: PlanWindow,
  preferred?: TermCode | null,
): TermCode | null {
  const selectable = new Set(
    choices.filter((term) => term.availability !== "not-offered").map((term) => term.code),
  );
  if (preferred && selectable.has(preferred)) return preferred;
  if (selectable.has(window.registration)) return window.registration;
  const next = nextRegularTerm(window.registration);
  if (selectable.has(next)) return next;
  return null;
}

/** The status an add records: in-progress for the current term, planned for later terms. */
export function addStatus(termCode: TermCode, current: TermCode): "in-progress" | "planned" {
  return compareTerms(termCode, current) === 0 ? "in-progress" : "planned";
}
