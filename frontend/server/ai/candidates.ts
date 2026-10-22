import "server-only";
import {
  compareTerms,
  nextRegularTerm,
  prevRegularTerm,
  termLabel,
  termSeason,
  type TermCode,
} from "@/lib/term";
import {
  canonicalCourseCode,
  type Availability,
  type Course,
  type CourseSummary,
  type ReqCode,
  type ResolvedTerms,
} from "@/lib/types/catalog";
import type { Career } from "@/lib/types/content";
import { normalizeCourseCode } from "@/lib/types/common";
import type { Basis, GroundingCandidate } from "@/server/ai/grounding";
import { getCourse, getCourseHistory, searchCourses } from "@/server/catalog";

/**
 * Retrieval for the grounded features (PLAN §5 "AI grounding & validation"): the server decides which courses the
 * model may suggest; the model only ranks and explains.
 *
 * Plan suggestions: courses in the target term (published) or, for an unpublished term, courses that ran in one
 * of the last 4 regular terms (basis "past-offerings", labelled "Not yet scheduled — based on past offerings"),
 * that fill at least one of the student's open requirement slots, are not completed or planned (cross-listed
 * siblings count), are not registration-only listings or 0-credit sections, with restriction flags from the
 * sections (eligible class years, W sections once COMP is met, permission required): flags, never a block.
 *
 * Career plan: the career path's curated courses that the catalog knows, plus the registration term's courses in
 * the career's departments, each with the upcoming terms it may be taken in: a published term where it is offered
 * ("scheduled"), or an unpublished one when it ran in a same-season term among the last 4 published regular terms
 * ("past-offerings").
 *
 * Order is stable: it depends on the courses, their requirement slots and restrictions, never on seat counts,
 * which change every catalog refresh (every 15 minutes for the registration term). The same catalog gives the
 * same candidates in the same order, so the prompt and the personal cache do not churn with enrolment.
 */

export type CandidateFlag = "restricted-standing" | "comp-met-w-section" | "permission-required";

export interface PlanCandidate extends GroundingCandidate {
  title: string;
  basis: Basis;
  /** Past offerings: the terms it ran in (newest first). */
  ranIn: TermCode[];
  fills: ReqCode[];
  flags: CandidateFlag[];
  /** Open seats in the target term (published terms only; context only: never part of the order or the prompt). */
  openSeats: number | null;
}

export interface PlanCandidateInput {
  targetTerm: TermCode;
  openCodes: readonly ReqCode[];
  taken: ReadonlySet<string>;
  /** The student's class year (1–4) in the target term; null when unknown. */
  classYear: number | null;
  /** COMP met (or being met) before the target term: W sections are closed to the student. */
  compMet: boolean;
  /** At most this many (default MAX_PLAN_CANDIDATES; Infinity for the whole pool). */
  limit?: number;
  hasData?: TermDataProbe;
}

export const MAX_PLAN_CANDIDATES = 40;
const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 5;

/** Whether a term has sections; a search ingests an in-window term on first use. */
export type TermDataProbe = (term: TermCode) => Promise<boolean>;

/** A probe memoised for one request. */
export function termDataProbe(): TermDataProbe {
  const known = new Map<TermCode, Promise<boolean>>();
  return (term) => {
    let pending = known.get(term);
    if (!pending) {
      pending = searchCourses({ term, pageSize: 1 }).then((result) => result.total > 0);
      known.set(term, pending);
    }
    return pending;
  };
}

/** The `count` most recent regular terms before `term` that have sections (newest first; looks back 8 terms). */
export async function recentTermsWithData(
  term: TermCode,
  count: number,
  hasData: TermDataProbe,
): Promise<TermCode[]> {
  const out: TermCode[] = [];
  let cursor = prevRegularTerm(term);
  for (let i = 0; i < 8 && out.length < count && Number(cursor.slice(0, 4)) >= 2000; i++) {
    if (await hasData(cursor)) out.push(cursor);
    cursor = prevRegularTerm(cursor);
  }
  return out;
}

async function searchAll(
  term: TermCode,
  filter: { req?: ReqCode[]; dept?: string[] },
): Promise<CourseSummary[]> {
  const out: CourseSummary[] = [];
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const result = await searchCourses({ term, ...filter, pageSize: SEARCH_PAGE_SIZE, page });
    out.push(...result.items);
    if (page * SEARCH_PAGE_SIZE >= result.total) break;
  }
  return out;
}

function siblingCodes(course: Course): string[] {
  return [
    ...new Set(course.sections.flatMap((s) => s.crossListings.map((c) => c.courseCode))),
  ].filter((code) => code !== course.code);
}

function isTaken(taken: ReadonlySet<string>, code: string, canonical: string, siblings: string[]) {
  return taken.has(code) || taken.has(canonical) || siblings.some((s) => taken.has(s));
}

/** Registration-only listings (upstream reg_fors) and 0-credit sections are never suggested. */
function suggestible(course: Course): boolean {
  if (course.sections.length === 0) return false;
  if (course.sections.every((s) => s.regFor !== null)) return false;
  return course.sections.some((s) => s.credits > 0);
}

export function restrictionFlags(
  course: Course,
  classYear: number | null,
  compMet: boolean,
): CandidateFlag[] {
  const flags: CandidateFlag[] = [];
  const sections = course.sections;
  if (
    classYear !== null &&
    sections.every(
      (s) =>
        s.restrictions.eligibleYears !== null && !s.restrictions.eligibleYears.includes(classYear),
    )
  ) {
    flags.push("restricted-standing");
  }
  if (compMet && sections.every((s) => s.restrictions.notIfCompMet))
    flags.push("comp-met-w-section");
  if (sections.every((s) => s.restrictions.permissionRequired)) flags.push("permission-required");
  return flags;
}

export async function planCandidates(input: PlanCandidateInput): Promise<PlanCandidate[]> {
  const openSet = new Set(input.openCodes);
  if (openSet.size === 0) return [];
  const hasData = input.hasData ?? termDataProbe();
  const isPublished = await hasData(input.targetTerm);
  const basis: Basis = isPublished ? "scheduled" : "past-offerings";
  const sourceTerms = isPublished
    ? [input.targetTerm]
    : await recentTermsWithData(input.targetTerm, 4, hasData);

  // code → terms it appears in (newest first) + the target-term summary
  const seen = new Map<string, { terms: TermCode[]; summary: CourseSummary }>();
  for (const term of sourceTerms) {
    for (const summary of await searchAll(term, { req: [...openSet] })) {
      const entry = seen.get(summary.code);
      if (entry) entry.terms.push(term);
      else seen.set(summary.code, { terms: [term], summary });
    }
  }

  const targetSeason = termSeason(input.targetTerm);
  const byCanonical = new Map<string, PlanCandidate & { sameSeason: boolean }>();
  for (const [code, { terms, summary }] of seen) {
    const latest = terms[0];
    if (!latest) continue;
    const course = await getCourse(latest, code);
    if (!course || !suggestible(course)) continue;
    const siblings = siblingCodes(course);
    const canonical = canonicalCourseCode(code, siblings);
    if (isTaken(input.taken, code, canonical, siblings)) continue;
    const fills = course.reqCodes.filter((req) => openSet.has(req));
    if (fills.length === 0) continue;
    const candidate = {
      courseCode: code,
      canonical,
      siblings,
      terms: new Map([[input.targetTerm, basis]]),
      title: course.title,
      basis,
      ranIn: isPublished ? [] : terms,
      fills,
      flags: restrictionFlags(course, input.classYear, input.compMet),
      openSeats: isPublished ? summary.openSeats : null,
      sameSeason: isPublished || terms.some((t) => termSeason(t) === targetSeason),
    };
    const existing = byCanonical.get(canonical);
    if (!existing || candidate.fills.length > existing.fills.length) {
      byCanonical.set(canonical, candidate);
    }
  }

  return [...byCanonical.values()]
    .sort(
      (a, b) =>
        a.flags.length - b.flags.length ||
        b.fills.length - a.fills.length ||
        Number(b.sameSeason) - Number(a.sameSeason) ||
        a.courseCode.localeCompare(b.courseCode),
    )
    .slice(0, input.limit ?? MAX_PLAN_CANDIDATES)
    .map(({ sameSeason: _sameSeason, ...candidate }) => candidate);
}

// ---- Career plan ---------------------------------------------------------------------------------------------------

export interface CareerCandidate extends GroundingCandidate {
  title: string;
  /** A curated course of the career path, or a registration-term course of one of its departments. */
  source: "curated" | "department";
  /** The curated reason from the career path, when the course is one of its curated courses. */
  curatedWhy?: string;
  termList: { code: TermCode; basis: Basis }[];
}

export interface CareerCandidateInput {
  career: Career;
  resolved: ResolvedTerms;
  /** Upcoming regular terms (registration term → graduation), in order. */
  windowTerms: readonly TermCode[];
  taken: ReadonlySet<string>;
  /** At most this many in all, and this many department courses (defaults 40 / 20; Infinity for the pool). */
  limit?: number;
  departmentLimit?: number;
  hasData?: TermDataProbe;
}

export const MAX_CAREER_CANDIDATES = 40;
export const MAX_DEPARTMENT_CANDIDATES = 20;

/**
 * Terms of the window a course may be taken in, from its availability history: a term with sections where it is
 * offered, or a term without sections when it was offered in a same-season term among `recent` (the latest
 * terms with sections).
 */
export function careerTerms(
  history: readonly Availability[],
  context: { published: ReadonlySet<TermCode>; recent: readonly TermCode[] },
  windowTerms: readonly TermCode[],
): { code: TermCode; basis: Basis }[] {
  const byTerm = new Map(history.map((a) => [a.termCode, a]));
  const recentOffered = context.recent.filter((t) => byTerm.get(t)?.status === "offered");
  const out: { code: TermCode; basis: Basis }[] = [];
  for (const term of windowTerms) {
    if (context.published.has(term)) {
      if (byTerm.get(term)?.status === "offered") out.push({ code: term, basis: "scheduled" });
    } else if (recentOffered.some((t) => termSeason(t) === termSeason(term))) {
      out.push({ code: term, basis: "past-offerings" });
    }
  }
  return out;
}

export async function careerCandidates(input: CareerCandidateInput): Promise<CareerCandidate[]> {
  const out: CareerCandidate[] = [];
  const canonicals = new Set<string>();
  const limit = input.limit ?? MAX_CAREER_CANDIDATES;
  const departmentLimit = input.departmentLimit ?? MAX_DEPARTMENT_CANDIDATES;
  const hasData = input.hasData ?? termDataProbe();
  const published = await publishedTerms(input.windowTerms, hasData);
  const recent = await recentTermsWithData(
    nextRegularTerm(input.resolved.registration),
    4,
    hasData,
  );

  const add = (
    course: Course,
    termList: { code: TermCode; basis: Basis }[],
    source: CareerCandidate["source"],
    curatedWhy?: string,
  ) => {
    if (termList.length === 0 || !suggestible(course)) return;
    const siblings = siblingCodes(course);
    const canonical = canonicalCourseCode(course.code, siblings);
    if (canonicals.has(canonical) || isTaken(input.taken, course.code, canonical, siblings)) return;
    canonicals.add(canonical);
    out.push({
      courseCode: course.code,
      canonical,
      siblings,
      terms: new Map(termList.map((t) => [t.code, t.basis])),
      termList,
      title: course.title,
      source,
      ...(curatedWhy ? { curatedWhy } : {}),
    });
  };

  for (const curated of input.career.courses) {
    if (out.length >= limit) break;
    const code = normalizeCourseCode(curated.code);
    let history: Availability[];
    try {
      history = await getCourseHistory(code);
    } catch {
      continue;
    }
    const termList = careerTerms(history, { published, recent }, input.windowTerms);
    const offered = history
      .filter((a) => a.status === "offered")
      .map((a) => a.termCode)
      .sort(compareTerms);
    const latest = offered[offered.length - 1];
    const course = latest ? await getCourse(latest, code) : null;
    if (course) add(course, termList, "curated", curated.why);
  }

  const registration = input.resolved.registration;
  const departments = input.career.departments.map((d) => d.code);
  if (departments.length > 0 && published.has(registration)) {
    let added = 0;
    // By code (100-level first), never by seats: see the module comment.
    const summaries = (await searchAll(registration, { dept: departments }))
      .filter((s) => /^[A-Z]{2,4} [1-3]\d\d/.test(s.code))
      .sort(
        (a, b) =>
          courseNumber(a.code).localeCompare(courseNumber(b.code)) || a.code.localeCompare(b.code),
      );
    for (const summary of summaries) {
      if (out.length >= limit || added >= departmentLimit) break;
      const course = await getCourse(registration, summary.code);
      const before = out.length;
      if (course) add(course, [{ code: registration, basis: "scheduled" }], "department");
      if (out.length > before) added++;
    }
  }
  return out;
}

/** "CSC 221" → "221" (the level-first order of department candidates). */
function courseNumber(code: string): string {
  return code.split(" ")[1] ?? code;
}

/**
 * The candidates the prompt gets from a career pool (careerCandidates with both limits at Infinity): every
 * curated course, then the first MAX_DEPARTMENT_CANDIDATES department courses, MAX_CAREER_CANDIDATES in all.
 */
export function selectCareerCandidates(pool: readonly CareerCandidate[]): CareerCandidate[] {
  const curated = pool.filter((c) => c.source === "curated");
  const department = pool
    .filter((c) => c.source === "department")
    .slice(0, MAX_DEPARTMENT_CANDIDATES);
  return [...curated, ...department].slice(0, MAX_CAREER_CANDIDATES);
}

/** The terms among `terms` that have sections. */
export async function publishedTerms(
  terms: readonly TermCode[],
  hasData: TermDataProbe,
): Promise<Set<TermCode>> {
  const flags = await Promise.all(terms.map((term) => hasData(term)));
  return new Set(terms.filter((_, index) => flags[index]));
}

/** "Spring 2027" labels for the upcoming terms block. */
export function termRefs(published: ReadonlySet<TermCode>, terms: readonly TermCode[]) {
  return terms.map((code) => ({ code, label: termLabel(code), scheduled: published.has(code) }));
}
