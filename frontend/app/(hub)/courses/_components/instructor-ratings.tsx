import { RatingSummary } from "@/components/domain/rating-summary";
import type { Instructor, Section } from "@/lib/types/catalog";
import type { InstructorRating, RmpRating } from "@/lib/types/ratings";
import { instructorName } from "../_lib/format";
import { instructorKeyOf, type RatingsLookup } from "../_lib/ratings";

/**
 * "Instructors on RateMyProfessors": each rated instructor once, with what RMP says about them (rating and count,
 * difficulty, would take again, the most common tags with their own count and date, the source and the profile
 * link). Self-contained and fed by a de-duplicated instructor list (ratedInstructors), so the course page can
 * place it anywhere: today under the sections, later on a hoisted "Both sections:" line or per section row.
 */

export type MatchedRating = InstructorRating & { rmp: RmpRating };

export interface RatedInstructor {
  instructor: Instructor;
  rating: MatchedRating;
}

/** A rating worth showing: a matched profile with at least one rating. */
export function shownRating(rating: InstructorRating | null | undefined): MatchedRating | null {
  return rating?.status === "matched" && rating.rmp && rating.rmp.numRatings > 0
    ? (rating as MatchedRating)
    : null;
}

/** Each instructor with a shown rating, once (however many sections they teach), in section order. */
export function ratedInstructors(
  sections: readonly Section[],
  ratings: RatingsLookup | null,
): RatedInstructor[] {
  if (!ratings) return [];
  const seen = new Set<string>();
  const rated: RatedInstructor[] = [];
  for (const section of sections) {
    for (const instructor of section.instructors) {
      if (instructor.isStaff) continue;
      const key = instructorKeyOf(instructor);
      if (seen.has(key)) continue;
      seen.add(key);
      const rating = shownRating(ratings.get(key));
      if (rating) rated.push({ instructor, rating });
    }
  }
  return rated;
}

/** Nothing without a rated instructor. */
export function InstructorRatings({
  instructors,
  className,
}: {
  instructors: readonly RatedInstructor[];
  className?: string;
}) {
  if (instructors.length === 0) return null;
  return (
    <div className={className} data-testid="instructor-ratings">
      <h3 id="instructor-ratings-title" className="text-base font-strong text-fg">
        Instructors on RateMyProfessors
      </h3>
      <ul aria-labelledby="instructor-ratings-title" className="mt-3 flex flex-col gap-5">
        {instructors.map(({ instructor, rating: { rmp } }) => {
          const name = instructorName(instructor);
          return (
            <li
              key={instructorKeyOf(instructor)}
              data-aggregated="ratemyprofessors"
              className="flex min-w-0 flex-col gap-2"
            >
              <p className="text-sm font-semibold text-fg">{name}</p>
              <RatingSummary
                status="matched"
                avgRating={rmp.avgRating}
                numRatings={rmp.numRatings}
                avgDifficulty={rmp.avgDifficulty}
                wouldTakeAgainPct={rmp.wouldTakeAgainPct}
                topTags={rmp.topTags}
                tagRatingsCounted={rmp.tagRatingsCounted}
                tagsAsOf={rmp.tagsAsOf}
                asOf={rmp.asOf}
                url={rmp.url}
                instructorName={name}
                nameShown
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
