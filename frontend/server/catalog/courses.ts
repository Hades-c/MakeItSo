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
 * The course-level title is the title most sections share, ignoring companion lab sections (MIL 101 L "Leadership
 * Lab Indv Tasks 1" does not name MIL 101); ties go to the earliest section (A before B).
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

export function courseTitle(sections: readonly Section[]): string {
  const sorted = [...sections].sort(compareSections);
  const primary = sorted.filter((section) => !isCompanionLab(section, sorted));
  const pool = primary.length > 0 ? primary : sorted;
  const counts = new Map<string, number>();
  for (const section of pool) counts.set(section.title, (counts.get(section.title) ?? 0) + 1);
  let best = pool[0]?.title ?? "";
  for (const section of pool) {
    if ((counts.get(section.title) ?? 0) > (counts.get(best) ?? 0)) best = section.title;
  }
  return best;
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

/** One course from its sections (all with the same termCode and courseCode). */
export function buildCourse(sections: readonly Section[]): Course {
  const sorted = [...sections].sort(compareSections);
  const first = sorted[0];
  if (!first) throw new RangeError("buildCourse needs at least one section");
  return {
    termCode: first.termCode,
    code: first.courseCode,
    title: courseTitle(sorted),
    sections: sorted,
    credits: distinctCredits(sorted),
    reqCodes: unionReqCodes(sorted),
  };
}

export function summarizeCourse(course: Course): CourseSummary {
  return {
    termCode: course.termCode,
    code: course.code,
    title: course.title,
    credits: course.credits,
    reqCodes: course.reqCodes,
    sectionCount: course.sections.length,
    openSeats: course.sections.reduce((sum, section) => sum + openSeats(section.enrollment), 0),
    instructorNames: instructorNames(course.sections),
    crossListings: crossListedCodes(course.sections.flatMap((section) => section.crossListings)),
    hasTba: course.sections.some(isTbaOnly),
  };
}
