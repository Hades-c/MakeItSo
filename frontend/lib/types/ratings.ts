import { z } from "zod";
import { InstructorSchema } from "@/lib/types/catalog";
import { HttpsUrlSchema, IsoDateTimeSchema } from "@/lib/types/common";

/**
 * Professor ratings (PLAN §4.1.7, §5 "Ratings (RMP)"). server/rmp (W2) matches catalog instructors against the
 * weekly RateMyProfessors roster (models/RmpTeacher.ts). Matching needs a normalised surname AND a first-name /
 * nickname match — never surname-only. Show rating, count, "as of" and the RMP link; nothing when unmatched.
 * No review text unless RMP_SUMMARIES_ENABLED.
 *
 * status:
 *   matched    one Davidson profile matched (rmp present)
 *   unmatched  no confident match: show nothing
 *   staff      the "Staff" placeholder: no lookup ("Staff (TBA)")
 *   disabled   RMP_ENABLED is off: show nothing
 *   review     a candidate exists but needs a person (e.g. department conflict): show nothing until resolved
 */
export const RatingStatusSchema = z.enum(["matched", "unmatched", "staff", "disabled", "review"]);
export type RatingStatus = z.infer<typeof RatingStatusSchema>;

export const RmpRatingSchema = z.object({
  legacyId: z.number().int().positive(),
  avgRating: z.number().min(0).max(5),
  numRatings: z.number().int().min(0),
  avgDifficulty: z.number().min(0).max(5),
  /** null when RMP has no value (it sends -1). */
  wouldTakeAgainPct: z.number().min(0).max(100).nullable(),
  department: z.string(),
  /** https://www.ratemyprofessors.com/professor/<legacyId> */
  url: HttpsUrlSchema,
  /** When the roster row was fetched. */
  asOf: IsoDateTimeSchema,
});
export type RmpRating = z.infer<typeof RmpRatingSchema>;

export const InstructorRatingSchema = z
  .object({
    instructor: InstructorSchema,
    status: RatingStatusSchema,
    rmp: RmpRatingSchema.optional(),
  })
  .refine((r) => (r.status === "matched") === (r.rmp !== undefined), {
    message: "rmp is present exactly when status is matched",
    path: ["rmp"],
  });
export type InstructorRating = z.infer<typeof InstructorRatingSchema>;

/** `syncRoster()` outcome (also recorded with `recordSync("ratemyprofessors", ...)`). */
export const RosterSyncResultSchema = z.object({
  ok: z.boolean(),
  count: z.number().int().min(0),
  /** Nodes dropped because school.id was not Davidson's. */
  rejectedOtherSchool: z.number().int().min(0),
  error: z.string().optional(),
});
export type RosterSyncResult = z.infer<typeof RosterSyncResultSchema>;

/** RateMyProfessors' GraphQL id for Davidson College ("School-3965"). */
export const RMP_DAVIDSON_SCHOOL_ID = "U2Nob29sLTM5NjU=";
