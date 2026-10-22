import "server-only";
import {
  CLASS_STANDINGS,
  classStanding,
  compareTerms,
  isTermCode,
  nextRegularTerm,
  parseTermCode,
  termCodeFor,
  termLabel,
  termsBetween,
  type ClassStanding,
  type TermCode,
} from "@/lib/term";

/**
 * Terms and class standing for one student's plan (PLAN §5 "Plan items": term pickers run from the first term
 * through gradYear+1; "Sections": class-year restrictions against the derived standing or the profile override).
 * Pure: the caller loads the profile (server/plan/context.ts) and passes `now`.
 */

export interface PlanContext {
  /** Expected graduation year (the profile's, else the first-year class's). */
  graduationYear: number;
  /** First term at Davidson (the profile's, else Fall of graduationYear − 4). */
  firstTerm: TermCode;
  /** The student-set standing (for the academic year it was set in: now), or null. */
  standingOverride: ClassStanding | null;
}

export interface PlanTermRange {
  first: TermCode;
  /** Summer of graduationYear + 1 ("gradYear+1"): the last term a plan entry may use. */
  last: TermCode;
}

/** The last term code the calendar rules allow (academic year 2099). */
const LAST_TERM_CODE = "209903";

function safeTermCodeFor(season: "Fall" | "Spring" | "Summer", year: number): TermCode {
  try {
    return termCodeFor(season, year);
  } catch {
    return year < 2000 ? "198801" : LAST_TERM_CODE;
  }
}

/** The default first term for a graduation year: Fall, four years before. */
export function defaultFirstTermFor(graduationYear: number): TermCode {
  return safeTermCodeFor("Fall", graduationYear - 4);
}

/**
 * The plan's term range: the first term through graduationYear + 1 (the academic year after the graduation
 * spring: Fall of the graduation year, the next Spring and Summer), so a delayed graduation can be planned.
 */
export function planTermRange(context: Pick<PlanContext, "firstTerm" | "graduationYear">) {
  const last = safeTermCodeFor("Summer", context.graduationYear + 1);
  const first = isTermCode(context.firstTerm)
    ? context.firstTerm
    : defaultFirstTermFor(context.graduationYear);
  return { first: compareTerms(first, last) > 0 ? last : first, last } satisfies PlanTermRange;
}

/** Every selectable term (summers included, never a default), oldest first. */
export function planTerms(context: Pick<PlanContext, "firstTerm" | "graduationYear">): TermCode[] {
  const { first, last } = planTermRange(context);
  return termsBetween(first, last, { includeSummer: true });
}

export function isInPlanRange(
  context: Pick<PlanContext, "firstTerm" | "graduationYear">,
  term: TermCode,
): boolean {
  if (!isTermCode(term)) return false;
  const { first, last } = planTermRange(context);
  return compareTerms(term, first) >= 0 && compareTerms(term, last) <= 0;
}

/** "Fall 2026 – Summer 2031" for messages. */
export function planRangeLabel(context: Pick<PlanContext, "firstTerm" | "graduationYear">) {
  const { first, last } = planTermRange(context);
  return `${termLabel(first)} – ${termLabel(last)}`;
}

/** A day inside the term's academic year and season, for standing arithmetic (standing rolls over June 1). */
function representativeDate(term: TermCode): Date {
  const parsed = parseTermCode(term);
  if (!parsed) throw new RangeError(`Invalid term code: ${term}`);
  const month = parsed.season === "Fall" ? 10 : parsed.season === "Spring" ? 2 : 7;
  return new Date(Date.UTC(parsed.year, month - 1, 15, 16));
}

/** Calendar year the academic year of `at` ends in (June 1 rollover, as lib/term classStanding). */
function academicYearEndOf(at: Date): number {
  const month = at.getUTCMonth() + 1;
  return month >= 6 ? at.getUTCFullYear() + 1 : at.getUTCFullYear();
}

/**
 * The student's class standing during `term`: derived from the graduation year for that term's academic year, or
 * the override shifted by the academic years between now and the term (an override set as "sophomore" this year
 * reads as "junior" next year).
 */
export function standingForTerm(context: PlanContext, term: TermCode, now: Date): ClassStanding {
  const at = representativeDate(term);
  if (!context.standingOverride) return classStanding(context.graduationYear, at).standing;
  const shift = academicYearEndOf(at) - academicYearEndOf(now);
  const index = CLASS_STANDINGS.indexOf(context.standingOverride) + shift;
  return CLASS_STANDINGS[Math.min(CLASS_STANDINGS.length - 1, Math.max(0, index))] ?? "senior";
}

/** Class year 1–4 of a standing (an incoming student registers as a first-year); null once graduated. */
export function standingYear(standing: ClassStanding): 1 | 2 | 3 | 4 | null {
  switch (standing) {
    case "incoming":
    case "first-year":
      return 1;
    case "sophomore":
      return 2;
    case "junior":
      return 3;
    case "senior":
      return 4;
    default:
      return null;
  }
}

const STANDING_LABELS: Readonly<Record<ClassStanding, string>> = {
  incoming: "an incoming student",
  "first-year": "a first-year",
  sophomore: "a sophomore",
  junior: "a junior",
  senior: "a senior",
  graduated: "a graduate",
};

export function standingLabel(standing: ClassStanding): string {
  return STANDING_LABELS[standing];
}

/**
 * The last term of the student's first year at Davidson: the second regular term from the first term (Fall 2026
 * → Spring 2027; a Spring 2027 start → Fall 2027). The writing requirement is due by its end.
 */
export function firstYearLastTerm(firstTerm: TermCode): TermCode {
  const start =
    parseTermCode(firstTerm)?.season === "Summer" ? nextRegularTerm(firstTerm) : firstTerm;
  return nextRegularTerm(start);
}
