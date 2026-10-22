import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * One RateMyProfessors teacher from the weekly Davidson roster (PLAN §5 "Ratings (RMP)"; owner W2). Collection
 * `rmpteachers`, written only by `syncRoster()` (server/rmp/roster.ts), which replaces the whole roster per run
 * and keeps the old one when a run fails or shrinks below half. Only Davidson nodes are stored (school.id checked
 * at ingest). No review text is ever stored.
 *
 * - `firstName`/`lastName`/`department`: RMP's values, trimmed (display and matching both re-normalise them).
 * - `normalizedFirst`/`normalizedLast`: normalizeName() of the names (NFKD accent strip, lower case, apostrophes
 *   removed so O''Geen → ogeen, periods/hyphens → spaces, whitespace collapsed and trimmed).
 * - `nameTokens`: every token of both names plus the surname written as one word; getRatings() pulls candidates
 *   with `{ nameTokens: { $in: <instructor surname tokens> } }`. Recomputed on every sync.
 * - `fetchedAt`: the roster run that stored the row; shown as the rating's "as of".
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
  },
  { collection: "rmpteachers", timestamps: true },
);

RmpTeacherSchema.index({ legacyId: 1 }, { unique: true });
RmpTeacherSchema.index({ rmpId: 1 }, { unique: true });
RmpTeacherSchema.index({ normalizedLast: 1, normalizedFirst: 1 });
RmpTeacherSchema.index({ nameTokens: 1 });

export type RmpTeacherDoc = InferSchemaType<typeof RmpTeacherSchema>;
export type RmpTeacherDocument = HydratedDocument<RmpTeacherDoc>;

const RmpTeacher: Model<RmpTeacherDoc> =
  (mongoose.models.RmpTeacher as Model<RmpTeacherDoc> | undefined) ??
  mongoose.model<RmpTeacherDoc>("RmpTeacher", RmpTeacherSchema);

export default RmpTeacher;
