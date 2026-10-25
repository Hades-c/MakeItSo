import * as z from "zod";
import { InstructorSchema } from "@/lib/types/catalog";
import { HttpsUrlSchema, IsoDateTimeSchema } from "@/lib/types/common";

/**
 * Professor ratings (PLAN §4.1.7, §5 "Ratings (RMP)"). server/rmp (W2) matches catalog instructors against the
 * weekly RateMyProfessors roster (models/RmpTeacher.ts). Matching needs a normalised surname AND a first-name /
 * nickname match — never surname-only. Show rating, count, difficulty, "would take again", the most common tags,
 * "as of" and the RMP link; nothing when unmatched. No review text unless RMP_SUMMARIES_ENABLED (tags are RMP's
 * fixed labels, counted per rating, not review text).
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

/**
 * RateMyProfessors' fixed rating tags: a student picks up to three from this list when rating a teacher. RMP sends
 * them per rating as one "--"-separated string in sentence case ("Participation matters--Amazing lectures "),
 * which server/rmp/tags.ts normalises (trim, collapse spaces, case-insensitive) and keeps only when it is one of
 * these; anything else is dropped. Retired tags still appear on older ratings, so they stay in the list. Checked
 * against Davidson's ratings on 2026-10-25 (scripts/rmp-tags-smoke.ts): all 23 occur, nothing else does.
 */
export const RMP_TAGS = [
  "Tough grader",
  "Get ready to read",
  "Participation matters",
  "Extra credit",
  "Group projects",
  "Amazing lectures",
  "Clear grading criteria",
  "Gives good feedback",
  "Inspirational",
  "Lots of homework",
  "Hilarious",
  "Beware of pop quizzes",
  "So many papers",
  "Caring",
  "Respected",
  "Lecture heavy",
  "Test heavy",
  "Graded by few things",
  "Accessible outside class",
  "Online savvy",
  "Skip class? You won't pass.",
  // Retired from the rating form; still on older ratings.
  "Tests are tough",
  "Tests? Not many",
] as const;
export const RmpTagSchema = z.enum(RMP_TAGS);
export type RmpTag = z.infer<typeof RmpTagSchema>;

/** How many of a teacher's counted ratings carry `tag`. */
export const RmpTagCountSchema = z.object({
  tag: RmpTagSchema,
  count: z.number().int().positive(),
});
export type RmpTagCount = z.infer<typeof RmpTagCountSchema>;

/** At most this many tags are stored and served per teacher, most used first. */
export const RMP_TOP_TAGS = 5;

export const RmpRatingSchema = z.object({
  legacyId: z.number().int().positive(),
  avgRating: z.number().min(0).max(5),
  numRatings: z.number().int().min(0),
  /** 1–5 (5 = hardest); null when RMP has no value (it sends 0 while a teacher has no ratings). */
  avgDifficulty: z.number().min(1).max(5).nullable(),
  /** 0–100; null when RMP has no value (it sends -1 when nobody answered, 0 or -1 with no ratings). */
  wouldTakeAgainPct: z.number().min(0).max(100).nullable(),
  department: z.string(),
  /** https://www.ratemyprofessors.com/professor/<legacyId> */
  url: HttpsUrlSchema,
  /** When the roster row was fetched. */
  asOf: IsoDateTimeSchema,
  /** The teacher's most used tags, most used first ([] until the tags have been counted). */
  topTags: z.array(RmpTagCountSchema).max(RMP_TOP_TAGS),
  /** How many ratings the tag counts were taken from (0 until counted). */
  tagRatingsCounted: z.number().int().min(0),
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

/** The tag count step of the RMP cron (server/rmp/tags.ts). Stored progress survives a failed or cut-short run. */
export const TagSyncResultSchema = z.object({
  ok: z.boolean(),
  /** Teachers whose tags were counted and stored in this run. */
  updated: z.number().int().min(0),
  /** Rated teachers still due for a count after this run (0: every rated teacher is current). */
  remaining: z.number().int().min(0),
  /** GraphQL requests this run sent. */
  requests: z.number().int().min(0),
  /** The run stopped at its time budget; the next run continues with the teachers counted longest ago. */
  outOfTime: z.boolean(),
  error: z.string().optional(),
});
export type TagSyncResult = z.infer<typeof TagSyncResultSchema>;

/**
 * GET /api/cron/rmp (daily): the roster sync, skipped while the last good one is under six days old (so the roster
 * stays weekly), then the tag counts.
 */
export const RmpCronResultSchema = z.object({
  roster: z.discriminatedUnion("skipped", [
    RosterSyncResultSchema.extend({ skipped: z.literal(false) }),
    z.object({ skipped: z.literal(true), lastSuccessAt: IsoDateTimeSchema }),
  ]),
  tags: TagSyncResultSchema,
});
export type RmpCronResult = z.infer<typeof RmpCronResultSchema>;

/** RateMyProfessors' GraphQL id for Davidson College ("School-3965"). */
export const RMP_DAVIDSON_SCHOOL_ID = "U2Nob29sLTM5NjU=";
