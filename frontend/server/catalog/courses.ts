import "server-only";
import {
  crossListedCodes,
  REQ_CODES,
  type Course,
  type CourseLevel,
  type CourseSummary,
  type ReqCode,
  type Section,
} from "@/lib/types/catalog";
import { openSeats } from "@/server/catalog/normalize";

/**
 * Grouping a term's sections into courses (PLAN §4.1.2 Course / CourseSummary). Pure.
 *
 * Course title: sections keep their own titles (topics courses such as WRI 101 or ENG 110 differ by section).
 * The course-level title is the title the most sections share, ignoring companion lab sections (MIL 101 L
 * "Leadership Lab Indv Tasks 1" does not name MIL 101), but only when at least half of those sections share it
 * and no other title is as common. Otherwise the course is a topics course and gets a neutral title,
 * "<department name>: topics vary by section" ("Writing Program: topics vary by section" for WRI 101), so no single
 * section's topic ever names the whole course.
 *
 * Seats: a cross-listed listing with max 0 ("Register as <sibling>", PLAN §5) is the same class as its siblings, so
 * its registrable seats are its CRN-matched siblings' seats (registrableSeats).
 */

const REQ_ORDER = new Map<string, number>(REQ_CODES.map((code, i) => [code, i]));

export function compareSections(a: Section, b: Section): number {
  return a.section < b.section ? -1 : a.section > b.section ? 1 : a.crn < b.crn ? -1 : 1;
}

const LAB_SECTION = /^L\d{0,2}$/;
const LAB_TITLE = /\blab(?:oratory)?\b/i;
const COMBINED_LAB_TITLE = /\+\s*lab\b/i;

/** A lab section that accompanies the course's main sections (by section code "L…" or a "Lab" title). */
export function isCompanionLab(section: Section, all: readonly Section[]): boolean {
  if (LAB_SECTION.test(section.section) && all.some((s) => !LAB_SECTION.test(s.section))) {
    return true;
  }
  const labTitle = (s: Section) => LAB_TITLE.test(s.title) && !COMBINED_LAB_TITLE.test(s.title);
  return labTitle(section) && all.some((s) => !labTitle(s));
}

export const TOPICS_TITLE_SUFFIX = "topics vary by section";

/** The neutral title of a topics course: "Writing Program: topics vary by section". */
export function topicsTitle(subjectName: string | null | undefined): string {
  const name = (subjectName ?? "").trim();
  return name ? `${name}: ${TOPICS_TITLE_SUFFIX}` : "Topics vary by section";
}

/** The title shared by at least half of the non-lab sections (and more than any other), or null (topics). */
export function sharedTitle(sections: readonly Section[]): string | null {
  const sorted = [...sections].sort(compareSections);
  const primary = sorted.filter((section) => !isCompanionLab(section, sorted));
  const pool = primary.length > 0 ? primary : sorted;
  const counts = new Map<string, number>();
  for (const section of pool) counts.set(section.title, (counts.get(section.title) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const [top, runnerUp] = ranked;
  if (!top || top[1] * 2 < pool.length || (runnerUp && runnerUp[1] === top[1])) return null;
  return top[0];
}

/** True when the sections carry different titles and none is shared by most of them (WRI 101, ECO 495). */
export function isTopicsCourse(sections: readonly Section[]): boolean {
  return sections.length > 0 && sharedTitle(sections) === null;
}

/** The course-level title (see above); `subjectName` names the department in a topics course's title. */
export function courseTitle(sections: readonly Section[], subjectName?: string | null): string {
  return sharedTitle(sections) ?? topicsTitle(subjectName);
}

/** Hundreds digit of the course number: "101" → "100", "012" → "000"; null above 400. */
export function courseLevel(number: string): CourseLevel | null {
  const digit = number.charAt(0);
  return digit >= "0" && digit <= "4" ? (`${digit}00` as CourseLevel) : null;
}

export function unionReqCodes(sections: readonly Section[]): ReqCode[] {
  const codes = new Set<ReqCode>();
  for (const section of sections) for (const code of section.reqCodes ?? []) codes.add(code);
  return [...codes].sort((a, b) => (REQ_ORDER.get(a) ?? 0) - (REQ_ORDER.get(b) ?? 0));
}

export function distinctCredits(sections: readonly Section[]): number[] {
  return [...new Set(sections.map((section) => section.credits))].sort((a, b) => a - b);
}

/** Only TBA meetings (or none at all): no time to show or to check for conflicts. */
export function isTbaOnly(section: Section): boolean {
  return section.meetings.every((meeting) => meeting.tba);
}

export function instructorNames(sections: readonly Section[]): string[] {
  const names: string[] = [];
  for (const section of sections) {
    for (const instructor of section.instructors) {
      if (instructor.isStaff) continue;
      const name = `${instructor.first} ${instructor.last}`.trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Finds a section of the same term by CRN (the term index's byCrn). */
export type SectionLookup = (crn: string) => Section | undefined;

/**
 * Seats a student can register for through this listing: max(0, remaining), except that a cross-listed listing
 * with max 0 ("Register as <sibling>") offers its CRN-matched siblings' seats (ENV 214 A → PHY 214 A).
 */
export function registrableSeats(section: Section, lookup?: SectionLookup): number {
  if (section.enrollment.max === 0 && section.crossListings.length > 0 && lookup) {
    let seats = 0;
    for (const listing of section.crossListings) {
      const sibling = lookup(listing.crn);
      if (sibling && sibling.enrollment.max > 0) seats += openSeats(sibling.enrollment);
    }
    return seats;
  }
  return openSeats(section.enrollment);
}

export interface BuildCourseOptions {
  /** Upstream department name ("Writing Program"), for a topics course's neutral title. */
  subjectName?: string | null;
}

/** One course from its sections (all with the same termCode and courseCode). */
export function buildCourse(
  sections: readonly Section[],
  options: BuildCourseOptions = {},
): Course {
  const sorted = [...sections].sort(compareSections);
  const first = sorted[0];
  if (!first) throw new RangeError("buildCourse needs at least one section");
  return {
    termCode: first.termCode,
    code: first.courseCode,
    title: courseTitle(sorted, options.subjectName),
    sections: sorted,
    credits: distinctCredits(sorted),
    reqCodes: unionReqCodes(sorted),
  };
}

/** A search row. `lookup` (the term's sections by CRN) lets max-0 cross-listed listings count their siblings' seats. */
export function summarizeCourse(course: Course, lookup?: SectionLookup): CourseSummary {
  return {
    termCode: course.termCode,
    code: course.code,
    title: course.title,
    credits: course.credits,
    reqCodes: course.reqCodes,
    sectionCount: course.sections.length,
    openSeats: course.sections.reduce((sum, section) => sum + registrableSeats(section, lookup), 0),
    instructorNames: instructorNames(course.sections),
    crossListings: crossListedCodes(course.sections.flatMap((section) => section.crossListings)),
    hasTba: course.sections.some(isTbaOnly),
  };
}
