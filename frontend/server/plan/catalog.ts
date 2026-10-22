import "server-only";
import { compareTerms, type TermCode } from "@/lib/term";
import {
  canonicalCourseCode,
  REQ_CODES,
  type Course,
  type ReqCode,
  type ResolvedTerms,
  type Section,
} from "@/lib/types/catalog";
import {
  getCourse,
  getCourseHistory,
  getSection,
  resolveTerms,
  validateCourseCodes,
} from "@/server/catalog";

/**
 * The plan's view of the catalog (server/catalog, W1): the facts a plan item takes from the listing the student
 * registers under (PLAN §5 "Plan items", "Credits & requirements": title, credits, requirement codes, the
 * cross-listing canonical code). Pure mapping helpers plus the catalog-backed lookups.
 */

export interface CourseFacts {
  /** The listing: the section's own code when a CRN was chosen, else the course code. */
  courseCode: string;
  canonicalCode: string;
  title: string;
  credits: number;
  reqCodes: ReqCode[] | null;
  /** The term the facts come from. */
  termCode: TermCode;
  /** False when they come from another term's offering (the requested term does not have the course). */
  sameTerm: boolean;
  /** The course's sections in `termCode` (for restriction flags); one entry when facts come from a section. */
  sections: readonly Section[];
}

const REQ_ORDER = new Map<string, number>(REQ_CODES.map((code, index) => [code, index]));
const LAB_SECTION = /^L\d{0,2}$/;

function sortCodes(codes: Iterable<ReqCode>): ReqCode[] {
  return [...new Set(codes)].sort((a, b) => (REQ_ORDER.get(a) ?? 0) - (REQ_ORDER.get(b) ?? 0));
}

/** Credits are 0–4 in a plan item (0 = ensembles and MIL labs, 2 = HUM 103 / GRE 103). */
function clampCredits(credits: number): number {
  return Number.isFinite(credits) ? Math.min(4, Math.max(0, credits)) : 1;
}

/** Sections that name the course: companion labs ("MIL 101 L") are left out when lecture sections exist. */
function primarySections(sections: readonly Section[]): readonly Section[] {
  const primary = sections.filter((section) => !LAB_SECTION.test(section.section));
  return primary.length > 0 ? primary : sections;
}

/**
 * Requirement codes of a course planned without a section: the codes every section with data shares; null when
 * no section has data or they share none (a topics course whose sections differ: pick a section).
 */
export function sharedReqCodes(sections: readonly Section[]): ReqCode[] | null {
  const withData = primarySections(sections).filter((section) => section.reqCodes !== null);
  if (withData.length === 0) return null;
  let common = new Set<ReqCode>(withData[0]!.reqCodes ?? []);
  for (const section of withData.slice(1)) {
    const codes = new Set(section.reqCodes ?? []);
    common = new Set([...common].filter((code) => codes.has(code)));
  }
  return common.size > 0 ? sortCodes(common) : null;
}

/** Facts of a course planned without a section (course title, the credit-bearing sections' credits). */
export function factsFromCourse(course: Course, sameTerm: boolean): CourseFacts {
  const primary = primarySections(course.sections);
  const credits = primary.length > 0 ? Math.max(...primary.map((s) => s.credits)) : 1;
  const siblings = course.sections.flatMap((section) => section.crossListings);
  return {
    courseCode: course.code,
    canonicalCode: canonicalCourseCode(course.code, siblings),
    title: course.title.slice(0, 200),
    credits: clampCredits(credits),
    reqCodes: sharedReqCodes(course.sections),
    termCode: course.termCode,
    sameTerm,
    sections: course.sections,
  };
}

/** Facts of the section (listing) the student registers under: its own title, credits and codes. */
export function factsFromSection(section: Section): CourseFacts {
  return {
    courseCode: section.courseCode,
    canonicalCode: canonicalCourseCode(section.courseCode, section.crossListings),
    title: section.title.slice(0, 200),
    credits: clampCredits(section.credits),
    reqCodes: section.reqCodes && section.reqCodes.length > 0 ? sortCodes(section.reqCodes) : null,
    termCode: section.termCode,
    sameTerm: true,
    sections: [section],
  };
}

/** The codes a section answers to: its own and its cross-listed siblings'. */
export function sectionCodes(section: Pick<Section, "courseCode" | "crossListings">): string[] {
  return [section.courseCode, ...section.crossListings.map((listing) => listing.courseCode)];
}

/**
 * The offered term nearest to `target` (ties → the later one); the latest offering when `target` is null.
 */
export function nearestTerm(
  offered: readonly TermCode[],
  target: TermCode | null,
): TermCode | null {
  const sorted = [...offered].sort(compareTerms);
  if (sorted.length === 0) return null;
  if (!target) return sorted[sorted.length - 1] ?? null;
  const index = (term: TermCode) => {
    const year = Number(term.slice(0, 4));
    const part = Number(term.slice(5));
    return year * 3 + part;
  };
  let best: TermCode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const term of sorted) {
    const distance = Math.abs(index(term) - index(target));
    if (distance <= bestDistance) {
      best = term;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Catalog facts of `code` for a plan item in `termCode`: that term's course when offered; else the nearest
 * offering in another ingested term (the code is real, its title and credits come from there); null when the code
 * is in no ingested term (a manual, unverified entry). Throws the catalog's 503 when a term cannot be loaded.
 */
export async function lookupCourse(
  termCode: TermCode | null,
  code: string,
): Promise<CourseFacts | null> {
  if (termCode) {
    const course = await getCourse(termCode, code);
    if (course && course.sections.length > 0) return factsFromCourse(course, true);
  }
  const { valid } = await validateCourseCodes([code]);
  if (valid.length === 0) return null;
  const history = await getCourseHistory(code);
  const offered = history
    .filter((entry) => entry.status === "offered" && (entry.sectionCount ?? 1) > 0)
    .map((entry) => entry.termCode)
    .filter((term) => term !== termCode);
  const nearest = nearestTerm(offered, termCode);
  if (!nearest) return null;
  const course = await getCourse(nearest, code);
  return course && course.sections.length > 0 ? factsFromCourse(course, false) : null;
}

/** A section by CRN in a term; null when it does not exist there. */
export async function lookupSection(termCode: TermCode, crn: string): Promise<Section | null> {
  return getSection(termCode, crn);
}

/** Current, registration and published terms (the catalog's resolver). */
export async function catalogTerms(): Promise<ResolvedTerms> {
  return resolveTerms();
}

/** True when the term's schedule is published (at least one section ingested). */
export function isPublished(terms: ResolvedTerms, termCode: TermCode): boolean {
  return terms.terms.some((term) => term.code === termCode && term.published);
}
