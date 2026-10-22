import "server-only";
import type { Instructor } from "@/lib/types/catalog";
import type { InstructorRating } from "@/lib/types/ratings";
import { normalizeName } from "@/server/rmp/normalize";

/**
 * Ratings per instructor for the course page (server/rmp getCourseRatings, W2): one InstructorRating per distinct
 * instructor of the course, looked up from each section's instructor list by the same normalised name the matcher
 * uses, so "José" and "Jose" are one person and RMP's spelling never leaks into the key.
 */

export type RatingsLookup = ReadonlyMap<string, InstructorRating>;

/** Normalised "first|last". */
export function instructorKeyOf(instructor: Pick<Instructor, "first" | "last">): string {
  return `${normalizeName(instructor.first)}|${normalizeName(instructor.last)}`;
}

export function ratingsLookup(ratings: readonly InstructorRating[]): RatingsLookup {
  return new Map(ratings.map((rating) => [instructorKeyOf(rating.instructor), rating]));
}
