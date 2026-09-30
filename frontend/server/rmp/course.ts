import "server-only";
import type { TermCode } from "@/lib/term";
import type { CatalogSearchResult, Course, Instructor, Section } from "@/lib/types/catalog";
import type { InstructorRating } from "@/lib/types/ratings";
import { searchCourses } from "@/server/catalog";
import { ApiError } from "@/server/http/errors";
import type { RateLimitRule } from "@/server/http/rate-limit";
import { getRatings, type HomeSubjectsResolver } from "@/server/rmp";
import { isStaffName, normalizeName } from "@/server/rmp/normalize";

/**
 * Ratings for one course page (GET /api/ratings and the course page's server component, W8).
 *
 *   const course = await getCourse(term, code);
 *   const ratings = course ? await getCourseRatings(course) : [];
 *
 * An instructor of a course listed only under interdisciplinary programs (WRI 101, HUM 103, SIL, ...) is matched
 * with the help of their other sections in the term, found through the catalog search (catalogHomeSubjects).
 */

/** GET /api/ratings: per signed-in user. Generous for browsing, far too low to page through the roster. */
export const RATINGS_ROUTE_RATE_LIMIT: RateLimitRule = {
  name: "ratings",
  limit: 120,
  windowSec: 600,
  by: "user",
};

export interface CourseInstructors {
  /** Distinct instructors over all sections, in upstream order (Staff at most once). */
  instructors: Instructor[];
  /** The course's subject ("CHE"). */
  subject: string;
  /** Cross-listed siblings' subjects and cross-postings over all sections, excluding `subject`. */
  relatedSubjects: string[];
}

function instructorKey(instructor: Instructor): string {
  if (instructor.isStaff || isStaffName(instructor.first, instructor.last)) return "staff";
  return `${normalizeName(instructor.first)}|${normalizeName(instructor.last)}`;
}

export function courseInstructors(
  course: Pick<Course, "code"> & { sections: readonly Section[] },
): CourseInstructors {
  const subject = course.sections[0]?.subject ?? course.code.split(" ")[0] ?? "";
  const seen = new Set<string>();
  const instructors: Instructor[] = [];
  const related = new Set<string>();
  for (const section of course.sections) {
    for (const instructor of section.instructors) {
      const key = instructorKey(instructor);
      if (seen.has(key)) continue;
      seen.add(key);
      instructors.push({
        first: instructor.first,
        last: instructor.last,
        isStaff: instructor.isStaff,
      });
    }
    for (const listing of section.crossListings) related.add(listing.courseCode.split(" ")[0]!);
    for (const code of section.crossPostings) related.add(code.trim().toUpperCase());
  }
  related.delete(subject);
  related.delete("");
  return { instructors, subject, relatedSubjects: [...related].sort() };
}

const subjectOf = (code: string) => code.trim().split(/\s+/)[0]?.toUpperCase() ?? "";

/**
 * The subjects an instructor teaches in `term`, from the catalog search: every course whose instructor list names
 * them (after normalizeName), with its cross-listed siblings' subjects. null when the catalog cannot answer (the
 * 501 stub before W1 lands, a 503 outage): the instructor then stays "review" unless otherwise settled.
 */
export function catalogHomeSubjects(term: TermCode): HomeSubjectsResolver {
  return async (instructor) => {
    const name = `${instructor.first} ${instructor.last}`.replace(/\s+/g, " ").trim();
    const key = normalizeName(name);
    if (!key) return null;
    let result: CatalogSearchResult;
    try {
      result = await searchCourses({ term, q: name.slice(0, 100), pageSize: 100 });
    } catch (error) {
      // Only the catalog's typed errors mean "cannot say"; anything else (a missing fixture, a bug) propagates.
      if (error instanceof ApiError) return null;
      throw error;
    }
    const subjects = new Set<string>();
    for (const item of result.items) {
      if (!item.instructorNames.some((other) => normalizeName(other) === key)) continue;
      subjects.add(subjectOf(item.code));
      for (const sibling of item.crossListings) subjects.add(subjectOf(sibling));
    }
    subjects.delete("");
    return [...subjects].sort();
  };
}

export interface CourseRatingsOptions {
  /** Default: catalogHomeSubjects(the sections' term). null = never look up other sections. */
  homeSubjects?: HomeSubjectsResolver | null;
}

/** One rating per distinct instructor of the course, in upstream order. */
export async function getCourseRatings(
  course: Pick<Course, "code"> & { sections: readonly Section[] },
  options: CourseRatingsOptions = {},
): Promise<InstructorRating[]> {
  const { instructors, subject, relatedSubjects } = courseInstructors(course);
  const term = course.sections[0]?.termCode;
  const homeSubjects =
    options.homeSubjects === undefined
      ? term
        ? catalogHomeSubjects(term)
        : undefined
      : (options.homeSubjects ?? undefined);
  return getRatings(instructors, {
    subject,
    relatedSubjects,
    ...(homeSubjects ? { homeSubjects } : {}),
  });
}
