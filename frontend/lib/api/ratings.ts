import * as z from "zod";
import { apiRoute } from "@/lib/api/spec";
import { CourseCodeSchema, TermCodeSchema } from "@/lib/types/common";
import { InstructorRatingSchema, RosterSyncResultSchema } from "@/lib/types/ratings";

/**
 * Ratings (W2: app/api/ratings/**, app/api/cron/rmp/**). Ratings come from the stored weekly roster only: no
 * per-view RMP calls and no proxy route. Rate-limited. With RMP_ENABLED off every instructor has status
 * "disabled". Server components call server/rmp directly; this route serves client islands.
 */

export const RatingsQuerySchema = z.object({ term: TermCodeSchema, code: CourseCodeSchema });

export const RatingsResponseSchema = z.object({
  enabled: z.boolean(),
  /** One entry per distinct instructor of the course's sections, in upstream order. */
  ratings: z.array(InstructorRatingSchema),
});

export const ratingsApi = {
  /** GET /api/ratings?term=202602&code=CSC%20221 */
  forCourse: apiRoute({
    method: "GET",
    path: "/api/ratings",
    auth: "user",
    query: RatingsQuerySchema,
    response: RatingsResponseSchema,
  }),
  /** GET /api/cron/rmp (weekly, Bearer CRON_SECRET) → roster sync. */
  cronRoster: apiRoute({
    method: "GET",
    path: "/api/cron/rmp",
    auth: "cron",
    response: RosterSyncResultSchema,
  }),
} as const;
