import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * One RateMyProfessors teacher from the weekly Davidson roster (PLAN §5 "Ratings (RMP)"; owner W2). Collection
 * `rmpteachers`. Only Davidson nodes are stored (school.id checked at ingest). No review text is ever stored unless
 * RMP_SUMMARIES_ENABLED (and then in a separate collection W2/W6 define). `normalizedFirst`/`normalizedLast` are
 * the matcher's keys (NFD accent strip, lower case, trimmed, collapsed spaces, hyphen = space, doubled apostrophes
 * collapsed).
 */
const RmpTeacherSchema = new Schema(
  {
    /** GraphQL node id ("VGVhY2hlci0yNDU4NDk="). */
    rmpId: { type: String, required: true },
    legacyId: { type: Number, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    normalizedFirst: { type: String, required: true },
    normalizedLast: { type: String, required: true },
    department: { type: String, default: "" },
    schoolId: { type: String, required: true },
    avgRating: { type: Number, default: 0 },
    avgDifficulty: { type: Number, default: 0 },
    numRatings: { type: Number, default: 0 },
    /** null when RMP sends -1. */
    wouldTakeAgainPct: { type: Number, default: null },
    fetchedAt: { type: Date, required: true },
  },
  { collection: "rmpteachers", timestamps: true },
);

RmpTeacherSchema.index({ legacyId: 1 }, { unique: true });
RmpTeacherSchema.index({ rmpId: 1 }, { unique: true });
RmpTeacherSchema.index({ normalizedLast: 1, normalizedFirst: 1 });

export type RmpTeacherDoc = InferSchemaType<typeof RmpTeacherSchema>;
export type RmpTeacherDocument = HydratedDocument<RmpTeacherDoc>;

const RmpTeacher: Model<RmpTeacherDoc> =
  (mongoose.models.RmpTeacher as Model<RmpTeacherDoc> | undefined) ??
  mongoose.model<RmpTeacherDoc>("RmpTeacher", RmpTeacherSchema);

export default RmpTeacher;
