import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { routes } from "@/lib/routes";
import { compareTerms, termLabel, type TermCode } from "@/lib/term";
import type {
  Availability,
  CatalogFilters,
  CatalogQuery,
  CatalogSearchResult,
  Course,
  CourseSummary,
  ReqCode,
  ResolvedTerms,
} from "@/lib/types/catalog";
import {
  browseTerm,
  getCatalogFilters,
  getCourse,
  resolveTerms,
  searchCourses,
} from "@/server/catalog";
import { HISTORY_START } from "@/server/catalog/config";
import { courseAvailability } from "@/server/catalog/history";
import { inIngestWindow } from "@/server/catalog/terms";
import { requirementName } from "@/server/content/requirements";
import { ApiError } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";
import { instructorName, primarySections, restrictionFlags, sectionTimes } from "./format";
import {
  courseCodes,
  inPlanTerms,
  planPresence,
  plannedSectionsCache,
  warningsByTerm,
  type StudentPlan,
} from "./student";
import { registerAsMap, type RegisterAs } from "./sections";
import {
  addToPlanTerms,
  defaultAddTerm,
  planWindowTerms,
  unpublishedNote,
  type PlanWindow,
} from "./terms";

/**
 * The /courses data (PLAN §3 /courses): the term list for the selector (default: server/catalog browseTerm), the
 * department and requirement lists for the filters, one page of searchCourses() results, and per row what the
 * row shows besides the summary: each section's times, the requirement names, availability across the plan
 * window and what adding it would be warned about. Server-only; every optional part degrades on its own.
 */

export interface TermOption {
  code: TermCode;
  label: string;
}

export interface RowSection {
  crn: string;
  section: string;
  title: string;
  times: string[];
  instructors: string[];
  /** The sibling a max-0 cross-listed listing registers under ("Register as PHY 214 A"). */
  registerAs: RegisterAs | null;
  /** Restriction flags ("First-years and sophomores only"). */
  flags: string[];
}

export interface CourseRow {
  summary: CourseSummary;
  href: string;
  reqs: { code: ReqCode; name: string }[];
  /** Up to MAX_ROW_SECTIONS primary sections (labs listed only when there is nothing else). */
  sections: RowSection[];
  /** Sections not listed in `sections`. */
  moreSections: number;
  /** Add to plan: null when the course's availability cannot be read. */
  add: {
    terms: AddToPlanTerm[];
    initialTerm: TermCode | null;
    inPlanTerms: TermCode[];
    warnings: Record<TermCode, string[]>;
    unpublishedNote: string | null;
  } | null;
}

export interface SearchView {
  term: TermCode;
  termOptions: TermOption[];
  window: PlanWindow;
  filters: CatalogFilters | null;
  result: CatalogSearchResult | null;
  rows: CourseRow[];
  /** The search itself failed (catalog 503): what to say. */
  error: string | null;
  /**
   * A past term MakeItSo keeps no schedule for (before the history window): the first term it has. Null for
   * every other term (a future term simply has no courses yet).
   */
  unavailableBefore: TermCode | null;
}

export const MAX_ROW_SECTIONS = 3;

function rethrowFatal(error: unknown): void {
  unstable_rethrow(error);
  if (error instanceof MissingFixtureError) throw error;
}

/** Terms offered in the selector: published terms, newest first, plus the selected one. */
export function termOptions(resolved: ResolvedTerms, selected: TermCode): TermOption[] {
  const codes = new Set(resolved.terms.filter((term) => term.published).map((term) => term.code));
  codes.add(selected);
  return [...codes]
    .sort((a, b) => compareTerms(b, a))
    .map((code) => {
      const tags = [
        code === resolved.current ? "current" : null,
        code === resolved.registration ? "registration" : null,
      ].filter(Boolean);
      return {
        code,
        label: tags.length ? `${termLabel(code)} (${tags.join(", ")})` : termLabel(code),
      };
    });
}

/** Pure: the row a summary + its course + its availability + the student's plan make. */
export function courseRow(input: {
  summary: CourseSummary;
  course: Course | null;
  history: readonly Availability[] | null;
  window: PlanWindow;
  term: TermCode;
  presence: ReadonlyMap<string, ReadonlySet<TermCode>> | null;
  warnings: Record<TermCode, string[]>;
  /** registerAsMap of the course's sections (max-0 CRN → sibling). */
  registerAs?: Readonly<Record<string, RegisterAs>>;
}): CourseRow {
  const { summary, course, history, window, term } = input;
  const primary = course ? primarySections(course.sections) : [];
  const sections: RowSection[] = primary.slice(0, MAX_ROW_SECTIONS).map((section) => {
    return {
      crn: section.crn,
      section: section.section,
      title: section.title,
      times: sectionTimes(section),
      instructors: section.instructors.map(instructorName),
      registerAs: input.registerAs?.[section.crn] ?? null,
      flags: restrictionFlags(section),
    };
  });
  const codes = course ? courseCodes(course) : new Set([summary.code, ...summary.crossListings]);
  const terms = history ? addToPlanTerms(history, window) : [];
  return {
    summary,
    href: routes.course(term, summary.code),
    reqs: summary.reqCodes.map((code) => ({ code, name: requirementName(code) })),
    sections,
    moreSections: Math.max(0, (course?.sections.length ?? summary.sectionCount) - sections.length),
    add:
      history && terms.length > 0
        ? {
            terms,
            initialTerm: defaultAddTerm(terms, window, term),
            inPlanTerms: inPlanTerms(input.presence, codes),
            warnings: input.warnings,
            unpublishedNote: unpublishedNote(history, window),
          }
        : null,
  };
}

async function safe<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    rethrowFatal(error);
    console.error(`[courses] could not load ${what}:`, error);
    return null;
  }
}

/**
 * The term /courses shows without ?term=: browseTerm(), which may cold-load the registration term. While the
 * schedule cannot be read (a 503: never ingested and the upstream is down), the resolved registration term, so the
 * page renders its own "could not be searched" state instead of the error boundary.
 */
async function defaultTerm(resolved: ResolvedTerms): Promise<TermCode> {
  try {
    return await browseTerm();
  } catch (error) {
    rethrowFatal(error);
    if (!(error instanceof ApiError && error.status === 503)) throw error;
    console.warn(
      "[courses] the default term could not be read; showing the registration term:",
      error.message,
    );
    return resolved.registration;
  }
}

/** Everything /courses renders. `plan` is the signed-in student's plan (null: unknown). */
export async function loadSearch(
  query: CatalogQuery,
  plan: StudentPlan | null,
): Promise<SearchView> {
  const resolved = await resolveTerms();
  const window: PlanWindow = { current: resolved.current, registration: resolved.registration };
  const term = query.term ?? (await defaultTerm(resolved));
  const [filters, searched] = await Promise.all([
    safe("the filters", () => getCatalogFilters(term)),
    (async () => {
      try {
        return { result: await searchCourses({ ...query, term }), error: null };
      } catch (error) {
        rethrowFatal(error);
        if (error instanceof ApiError && error.status < 500) throw error;
        console.error("[courses] search failed:", error);
        return {
          result: null,
          error:
            error instanceof ApiError
              ? error.message
              : "The course schedule could not be searched right now.",
        };
      }
    })(),
  ]);

  const items = searched.result?.items ?? [];
  const presence = plan ? planPresence(plan.items) : null;
  const planned = plan ? plannedSectionsCache(plan) : null;
  // Only the plan window's availability is shown on a row (contractRequest: a batch read in server/catalog).
  const windowTerms = planWindowTerms(window);
  const rows = await Promise.all(
    items.map(async (summary) => {
      const [course, history] = await Promise.all([
        safe(`course ${summary.code}`, () => getCourse(term, summary.code)),
        safe(`the history of ${summary.code}`, () => courseAvailability(summary.code, windowTerms)),
      ]);
      const shown = course ? primarySections(course.sections).slice(0, MAX_ROW_SECTIONS) : [];
      const terms = history ? addToPlanTerms(history, window) : [];
      const [registerAs, warnings] = await Promise.all([
        registerAsMap(shown),
        plan && planned && course && terms.length > 0
          ? warningsByTerm(plan, {
              terms: terms.map((t) => t.code),
              reference: course,
              courseIn: (t) =>
                t === term
                  ? Promise.resolve(course)
                  : terms.find((entry) => entry.code === t)?.availability === "offered"
                    ? safe(`${summary.code} in ${t}`, () => getCourse(t, summary.code))
                    : Promise.resolve(null),
              planned,
              resolved,
            })
          : Promise.resolve({}),
      ]);
      return courseRow({ summary, course, history, window, term, presence, warnings, registerAs });
    }),
  );

  return {
    term,
    termOptions: termOptions(resolved, term),
    window,
    filters,
    result: searched.result,
    rows,
    error: searched.error,
    unavailableBefore:
      compareTerms(term, resolved.registration) < 0 && !inIngestWindow(term, resolved)
        ? HISTORY_START
        : null,
  };
}
