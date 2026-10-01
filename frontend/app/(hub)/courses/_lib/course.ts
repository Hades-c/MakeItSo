import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { parseCourseSlug } from "@/lib/routes";
import { compareTerms, parseTermCode, type TermCode } from "@/lib/term";
import type { Availability, Course, ResolvedTerms, Section } from "@/lib/types/catalog";
import { aiGateFailure, type AiFailureKind } from "@/lib/types/ai";
import type { PlanItem } from "@/lib/types/plan";
import { aiGateInput } from "@/server/ai";
import { getCatalogFilters, getCourse, getCourseHistory, resolveTerms } from "@/server/catalog";
import { readCourse } from "@/server/catalog/read";
import { loadFlags } from "@/server/features";
import { MissingFixtureError } from "@/server/http/fixtures";
import { detectConflicts } from "@/server/plan";
import { getCourseRatings } from "@/server/rmp/course";
import { primarySections, sectionLabel } from "./format";
import { loadCoursePrograms, type CoursePrograms } from "./programs";
import { ratingsLookup, type RatingsLookup } from "./ratings";
import {
  courseCodes,
  inPlanTerms,
  planPresence,
  plannedSections,
  previewWarnings,
  type StudentPlan,
} from "./student";
import { addToPlanTerms, defaultAddTerm, unpublishedNote, type PlanWindow } from "./terms";
import { weekView, type WeekView } from "./week";

/**
 * Everything /courses/[term]/[code] renders (PLAN §3), read from the services directly. The page decides 404
 * first (parseCourseParams + resolveCoursePage) so nothing streams before notFound().
 */

export interface CourseParams {
  term: TermCode;
  code: string;
}

/** "[term]" + "[code]" path segments → a term and a course code; null for anything malformed. */
export function parseCourseParams(term: string, code: string): CourseParams | null {
  const parsedTerm = parseTermCode(term);
  const parsedCode = parseCourseSlug(code);
  if (!parsedTerm || !parsedCode) return null;
  return { term: parsedTerm.code, code: parsedCode };
}

function rethrowFatal(error: unknown): void {
  unstable_rethrow(error);
  if (error instanceof MissingFixtureError) throw error;
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

export interface ResolvedCoursePage {
  params: CourseParams;
  resolved: ResolvedTerms;
  /** The course in the page's term; null when it is not on that term's schedule. */
  course: Course | null;
  /** The latest offering (for title, description and prerequisites when `course` is null). */
  reference: Course;
  history: Availability[];
  /** The page term's own availability entry. */
  entry: Availability | null;
  /** When the page term's schedule was fetched ("Schedule data as of"); null when unknown. */
  asOf: string | null;
}

/** The latest term in which the course was offered, besides `except`. */
export function latestOffered(
  history: readonly Availability[],
  except?: TermCode,
): TermCode | null {
  return (
    history
      .filter((entry) => entry.status === "offered" && entry.termCode !== except)
      .map((entry) => entry.termCode)
      .sort((a, b) => compareTerms(b, a))[0] ?? null
  );
}

/**
 * The course and its history, or null for a 404: a malformed term/code, a code the schedule never had, or a term
 * the catalog does not know. A course that runs in other terms but not this one is a page ("Not on the Spring
 * 2027 schedule"), not a 404.
 */
export async function resolveCoursePage(params: CourseParams): Promise<ResolvedCoursePage | null> {
  // readCourse = getCourse plus the term's "as of" (contractRequest: expose it from server/catalog).
  const [resolved, read, history] = await Promise.all([
    resolveTerms(),
    readCourse(params.term, params.code),
    getCourseHistory(params.code),
  ]);
  const entry = history.find((item) => item.termCode === params.term) ?? null;
  const asOf = read?.asOf ?? null;
  if (read) {
    return { params, resolved, course: read.course, reference: read.course, history, entry, asOf };
  }
  if (!entry) return null;
  const latest = latestOffered(history, params.term);
  if (!latest) return null;
  const reference = await getCourse(latest, params.code);
  if (!reference) return null;
  return { params, resolved, course: null, reference, history, entry, asOf };
}

/** The section to show: `?crn=`, else the plan's section of this course, else the first primary section. */
export function chooseSection(
  course: Course,
  requestedCrn: string | null,
  planItems: readonly PlanItem[],
): Section | null {
  const byCrn = (crn: string | null | undefined) =>
    crn ? (course.sections.find((section) => section.crn === crn) ?? null) : null;
  const requested = byCrn(requestedCrn);
  if (requested) return requested;
  const codes = courseCodes(course);
  const planned = planItems.find(
    (item) =>
      item.termCode === course.termCode &&
      item.crn &&
      (codes.has(item.courseCode) || codes.has(item.canonicalCode)),
  );
  return byCrn(planned?.crn) ?? primarySections(course.sections)[0] ?? null;
}

export interface CourseWeek {
  view: WeekView;
  /** Plan items of the term without a placed section ("No section chosen yet"). */
  unplaced: PlanItem[];
  /** The plan holds another section of this course: its label. */
  plannedOtherSection: string | null;
}

export type AboutGate = "ready" | Extract<AiFailureKind, "unverified" | "consent_required">;

export interface CoursePageData extends ResolvedCoursePage {
  window: PlanWindow;
  departmentName: string | null;
  chosen: Section | null;
  ratings: RatingsLookup | null;
  programs: CoursePrograms | null;
  week: CourseWeek | null;
  add: {
    terms: AddToPlanTerm[];
    initialTerm: TermCode | null;
    inPlanTerms: TermCode[];
    warnings: Record<TermCode, string[]>;
    crns: Record<TermCode, string>;
    sectionLabels: Record<TermCode, string>;
    unpublishedNote: string | null;
  };
  /** The About panel: null = hidden (AI off or not configured). */
  aboutGate: AboutGate | null;
}

async function loadRatings(course: Course): Promise<RatingsLookup | null> {
  if (!loadFlags().rmp) return null;
  const ratings = await safe(`ratings for ${course.code}`, () => getCourseRatings(course));
  return ratings ? ratingsLookup(ratings) : null;
}

async function loadAboutGate(userId: string): Promise<AboutGate | null> {
  const input = await safe("the AI gate", () => aiGateInput(userId, "course-about"));
  if (!input) return null;
  const gate = aiGateFailure(input);
  if (!gate) return "ready";
  if (gate.kind === "unverified" || gate.kind === "consent_required") return gate.kind;
  return null;
}

async function loadWeek(
  course: Course,
  chosen: Section | null,
  plan: StudentPlan,
): Promise<CourseWeek | null> {
  const planned = await safe("the plan's sections", () => plannedSections(plan, course.termCode));
  if (!planned) return null;
  const codes = courseCodes(course);
  const isThisCourse = (section: Section) =>
    codes.has(section.courseCode) || section.crossListings.some((l) => codes.has(l.courseCode));
  const placed = planned
    .map((entry) => entry.section)
    .filter((section): section is Section => section !== null);
  const same = placed.filter(isThisCourse);
  const others = placed.filter((section) => !isThisCourse(section));
  const plannedSame = chosen ? same.filter((section) => section.crn === chosen.crn) : same;
  const shown = [...others, ...plannedSame];
  const withChosen = chosen && !plannedSame.length ? [...shown, chosen] : shown;
  const conflicts = detectConflicts(withChosen);
  const otherSame = chosen ? same.find((section) => section.crn !== chosen.crn) : undefined;
  return {
    view: weekView({ planned: shown, chosen, conflicts }),
    unplaced: planned.filter((entry) => entry.section === null).map((entry) => entry.item),
    plannedOtherSection: otherSame ? sectionLabel(otherSame) : null,
  };
}

/** The whole page for a resolved course. */
export async function loadCoursePage(
  page: ResolvedCoursePage,
  options: { userId: string; requestedCrn: string | null; plan: StudentPlan | null },
): Promise<CoursePageData> {
  const { course, reference, history, resolved, params } = page;
  const window: PlanWindow = { current: resolved.current, registration: resolved.registration };
  const chosen = course
    ? chooseSection(course, options.requestedCrn, options.plan?.items ?? [])
    : null;
  const codes = courseCodes(reference);

  const [filters, ratings, programs, week, aboutGate] = await Promise.all([
    safe("the departments", () => getCatalogFilters(reference.termCode)),
    course ? loadRatings(course) : Promise.resolve(null),
    loadCoursePrograms([...codes]),
    course && options.plan ? loadWeek(course, chosen, options.plan) : Promise.resolve(null),
    loadAboutGate(options.userId),
  ]);

  const subject = reference.sections[0]?.subject ?? reference.code.split(" ")[0] ?? "";
  const departmentName = filters?.departments.find((dept) => dept.code === subject)?.name ?? null;

  const terms = addToPlanTerms(history, window);
  const warnings: Record<TermCode, string[]> = {};
  if (options.plan && course) {
    const planned = await safe("the plan's sections", () =>
      plannedSections(options.plan!, params.term),
    );
    if (planned) {
      const list = previewWarnings(options.plan, course, planned, {
        term: params.term,
        terms: resolved,
        section: chosen,
      });
      if (list.length > 0) warnings[params.term] = list.map((warning) => warning.message);
    }
  }
  const crns: Record<TermCode, string> = {};
  const sectionLabels: Record<TermCode, string> = {};
  if (course && chosen) {
    crns[params.term] = chosen.crn;
    sectionLabels[params.term] = sectionLabel(chosen);
  }

  return {
    ...page,
    window,
    departmentName,
    chosen,
    ratings,
    programs,
    week,
    add: {
      terms,
      initialTerm: defaultAddTerm(terms, window, params.term),
      inPlanTerms: inPlanTerms(options.plan ? planPresence(options.plan.items) : null, codes),
      warnings,
      crns,
      sectionLabels,
      unpublishedNote: unpublishedNote(history, window),
    },
    aboutGate,
  };
}
