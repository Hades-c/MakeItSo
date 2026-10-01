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
  getCourseHistory,
  resolveTerms,
  searchCourses,
} from "@/server/catalog";
import { requirementName } from "@/server/content/requirements";
import { ApiError } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";
import { instructorName, primarySections, sectionTimes } from "./format";
import {
  courseCodes,
  inPlanTerms,
  planPresence,
  plannedSections,
  previewWarnings,
  type StudentPlan,
} from "./student";
import { addToPlanTerms, defaultAddTerm, unpublishedNote, type PlanWindow } from "./terms";

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
  /** "Register as PHY 214 A" for a max-0 cross-listed listing. */
  registerAs: string | null;
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
}): CourseRow {
  const { summary, course, history, window, term } = input;
  const primary = course ? primarySections(course.sections) : [];
  const sections: RowSection[] = primary.slice(0, MAX_ROW_SECTIONS).map((section) => {
    const sibling =
      section.enrollment.max === 0 && section.crossListings[0] ? section.crossListings[0] : null;
    return {
      crn: section.crn,
      section: section.section,
      title: section.title,
      times: sectionTimes(section),
      instructors: section.instructors.map(instructorName),
      registerAs: sibling ? `Register as ${sibling.courseCode} ${sibling.section}` : null,
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

/** Everything /courses renders. `plan` is the signed-in student's plan (null: unknown). */
export async function loadSearch(
  query: CatalogQuery,
  plan: StudentPlan | null,
): Promise<SearchView> {
  const resolved = await resolveTerms();
  const window: PlanWindow = { current: resolved.current, registration: resolved.registration };
  const term = query.term ?? (await browseTerm());
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
  const planned = plan
    ? await safe("the plan's sections", () => plannedSections(plan, term))
    : null;
  const rows = await Promise.all(
    items.map(async (summary) => {
      const [course, history] = await Promise.all([
        safe(`course ${summary.code}`, () => getCourse(term, summary.code)),
        safe(`the history of ${summary.code}`, () => getCourseHistory(summary.code)),
      ]);
      const warnings: Record<TermCode, string[]> = {};
      if (plan && course && planned) {
        const list = previewWarnings(plan, course, planned, { term, terms: resolved });
        if (list.length > 0) warnings[term] = list.map((warning) => warning.message);
      }
      return courseRow({ summary, course, history, window, term, presence, warnings });
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
  };
}
