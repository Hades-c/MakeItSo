import "server-only";
import type { Course, Instructor, Section } from "@/lib/types/catalog";
import type { InstructorRating } from "@/lib/types/ratings";
import type { RateLimitRule } from "@/server/http/rate-limit";
import { getRatings } from "@/server/rmp";
import { isStaffName, normalizeName } from "@/server/rmp/normalize";

/**
 * Ratings for one course page (GET /api/ratings and the course page's server component, W8).
 *
 *   const course = await getCourse(term, code);
 *   const ratings = course ? await getCourseRatings(course) : [];
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

/** One rating per distinct instructor of the course, in upstream order. */
export async function getCourseRatings(
  course: Pick<Course, "code"> & { sections: readonly Section[] },
): Promise<InstructorRating[]> {
  const { instructors, subject, relatedSubjects } = courseInstructors(course);
  return getRatings(instructors, { subject, relatedSubjects });
}
