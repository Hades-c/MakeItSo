import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { termLabel, type TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";

/**
 * Per-term availability of a career's course (PLAN §5 "Availability"), for the career page: the current term
 * (Fall 2026), the registration term (Spring 2027, the default for Add to plan) and the one after it (Fall 2027,
 * "Not yet published", plus "Usually offered in <season> (based on <terms>)" when the catalog says so). Pure: the
 * catalog's getCourseHistory() answer comes in, AddToPlanControl terms go out.
 */

export interface CareerTerms {
  current: TermCode;
  registration: TermCode;
  /** The regular term after registration: its schedule is not published yet. */
  next: TermCode;
}

/** The terms a career page shows, in order. */
export function careerTermCodes(terms: CareerTerms): TermCode[] {
  return [...new Set([terms.current, terms.registration, terms.next])];
}

/** "Fall 2024, Fall 2025 and Fall 2026". */
export function joinTermLabels(codes: readonly TermCode[]): string {
  const labels = codes.map(termLabel);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "Usually offered in Fall (based on Fall 2024 and Fall 2026)", or null without a claim. */
export function usuallyOfferedText(entry: Availability): string | null {
  if (entry.status !== "not-yet-published" || !entry.usually) return null;
  const basis =
    entry.usually.basedOn.length > 0 ? ` (based on ${joinTermLabels(entry.usually.basedOn)})` : "";
  return `Usually offered in ${entry.usually.season}${basis}`;
}

/**
 * The AddToPlanControl terms for one course. A term the history does not report (never ingested: nothing is
 * known about it) is left out rather than guessed; a published term is "offered" (with its section count) or
 * "not-offered"; an unpublished one is never a bare "offered".
 */
export function addToPlanTerms(
  history: readonly Availability[],
  terms: CareerTerms,
): AddToPlanTerm[] {
  const byTerm = new Map(history.map((entry) => [entry.termCode, entry]));
  const out: AddToPlanTerm[] = [];
  for (const code of careerTermCodes(terms)) {
    const entry = byTerm.get(code);
    if (!entry) continue;
    const term: AddToPlanTerm = {
      code,
      label: termLabel(code),
      availability: entry.status,
    };
    if (entry.status === "offered" && entry.sectionCount !== undefined) {
      term.sectionCount = entry.sectionCount;
    }
    if (entry.status === "not-yet-published" && entry.usually) {
      term.note = `Usually offered in ${entry.usually.season}`;
    }
    out.push(term);
  }
  return out;
}

/**
 * The term Add to plan starts on: the registration term when it can be chosen (PLAN §3: the registration term is
 * the default), else the first term that can, else none.
 */
export function defaultAddTerm(
  choices: readonly AddToPlanTerm[],
  registration: TermCode,
): TermCode | null {
  const selectable = choices.filter((term) => term.availability !== "not-offered");
  return selectable.find((term) => term.code === registration)?.code ?? selectable[0]?.code ?? null;
}

/** Where the course page link goes: the first term (registration, then current) that offers it. */
export function courseLinkTerm(
  history: readonly Availability[],
  terms: CareerTerms,
): TermCode | null {
  const offered = new Set(
    history.filter((entry) => entry.status === "offered").map((entry) => entry.termCode),
  );
  if (offered.has(terms.registration)) return terms.registration;
  if (offered.has(terms.current)) return terms.current;
  // The latest earlier term it ran in (a course page shows "Other terms" from there).
  const past = [...offered].sort().reverse()[0];
  return past ?? null;
}
