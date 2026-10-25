import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { RMP_TAGS } from "@/lib/types/ratings";

/**
 * One RateMyProfessors teacher from the weekly Davidson roster (PLAN §5 "Ratings (RMP)"; owner W2). Collection
 * `rmpteachers`. The roster fields are written only by `syncRoster()` (server/rmp/roster.ts), which replaces the
 * whole roster per run and keeps the old one when a run fails or shrinks below half; the tag fields only by the
 * tag counts (server/rmp/tags.ts), which the roster sync leaves alone. Only Davidson nodes are stored (school.id
 * checked at ingest). No review text is ever stored: tags are RMP's fixed labels, stored as counts.
 *
 * - `firstName`/`lastName`/`department`: RMP's values, trimmed (display and matching both re-normalise them).
 * - `normalizedFirst`/`normalizedLast`: normalizeName() of the names (NFKD accent strip, lower case, apostrophes
 *   removed so O''Geen → ogeen, periods/hyphens → spaces, whitespace collapsed and trimmed).
 * - `nameTokens`: every token of both names plus the surname written as one word; getRatings() pulls candidates
 *   with `{ nameTokens: { $in: <instructor surname tokens> } }`. Recomputed on every sync.
 * - `fetchedAt`: the roster run that stored the row; shown as the rating's "as of".
 * - `topTags`: the five tags (lib/types/ratings.ts RMP_TAGS) most used on the teacher's ratings, most used first,
 *   counted from `tagRatingsCounted` ratings at `tagsFetchedAt` (null: never counted), when RMP listed
 *   `tagsNumRatings` ratings; a different numRatings makes the teacher due for a recount.
 * - `tagsFailures` / `tagsRetryAt`: unusable tag answers in a row, and when the teacher is next asked (null: when
 *   due). A good count resets both; until `tagsRetryAt` the teacher is not due, so it never blocks the queue.
 */
const RmpTeacherSchema = new Schema(
  {
    /** GraphQL node id ("VGVhY2hlci0yNDU4NDk="). */
    rmpId: { type: String, required: true },
    legacyId: { type: Number, required: true, min: 1 },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    normalizedFirst: { type: String, required: true },
    normalizedLast: { type: String, required: true },
    nameTokens: { type: [String], default: [] },
    department: { type: String, default: "" },
    schoolId: { type: String, required: true },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    avgDifficulty: { type: Number, default: 0, min: 0, max: 5 },
    numRatings: { type: Number, default: 0, min: 0 },
    /** null when RMP sends -1 (no answers yet). */
    wouldTakeAgainPct: { type: Number, default: null, min: 0, max: 100 },
    fetchedAt: { type: Date, required: true },
    topTags: {
      type: [
        {
          _id: false,
          tag: { type: String, enum: RMP_TAGS, required: true },
          count: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
    tagRatingsCounted: { type: Number, default: 0, min: 0 },
    tagsNumRatings: { type: Number, default: null, min: 0 },
    tagsFetchedAt: { type: Date, default: null },
    tagsFailures: { type: Number, default: 0, min: 0 },
    tagsRetryAt: { type: Date, default: null },
  },
  { collection: "rmpteachers", timestamps: true },
);

RmpTeacherSchema.index({ legacyId: 1 }, { unique: true });
RmpTeacherSchema.index({ rmpId: 1 }, { unique: true });
RmpTeacherSchema.index({ normalizedLast: 1, normalizedFirst: 1 });
RmpTeacherSchema.index({ nameTokens: 1 });
// The tag counts' work order: never counted first, then the oldest count.
RmpTeacherSchema.index({ tagsFetchedAt: 1, legacyId: 1 });

export type RmpTeacherDoc = InferSchemaType<typeof RmpTeacherSchema>;
export type RmpTeacherDocument = HydratedDocument<RmpTeacherDoc>;

const RmpTeacher: Model<RmpTeacherDoc> =
  (mongoose.models.RmpTeacher as Model<RmpTeacherDoc> | undefined) ??
  mongoose.model<RmpTeacherDoc>("RmpTeacher", RmpTeacherSchema);

export default RmpTeacher;
