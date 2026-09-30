import { ratingsApi } from "@/lib/api/ratings";
import { getFlags } from "@/lib/flags";
import { termLabel } from "@/lib/term";
import { getCourse } from "@/server/catalog";
import { ApiError, defineRoute } from "@/server/http";
import { getCourseRatings, RATINGS_ROUTE_RATE_LIMIT } from "@/server/rmp/course";

// GET /api/ratings?term=202602&code=CSC%20221 → { enabled, ratings } (contract: lib/api/ratings.ts). Reads the
// stored weekly roster only: no RateMyProfessors call per view. Rate-limited per user.
export const GET = defineRoute(
  { ...ratingsApi.forCourse, rateLimit: RATINGS_ROUTE_RATE_LIMIT },
  async ({ query }) => {
    const course = await getCourse(query.term, query.code);
    if (!course) {
      throw new ApiError(
        404,
        "not_found",
        `${query.code} is not offered in ${termLabel(query.term)}.`,
      );
    }
    return { enabled: getFlags().rmp, ratings: await getCourseRatings(course) };
  },
);
