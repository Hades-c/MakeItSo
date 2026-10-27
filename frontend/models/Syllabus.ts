import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * A student's syllabus uploads, one document per (student, course, term), collection `syllabi` (PLAN-UX §3). The
 * uploaded file itself is never stored (server/syllabi/extract.ts reads it once, in memory, then discards it):
 * this document keeps only the course code, term, the original filename, when it was uploaded, and the
 * deadlines the AI extracted from it. Uploading again for the same course and term replaces this document
 * (server/syllabi/records.ts uploadSyllabusImpl); deleting it also removes the plan deadlines that trace back to
 * it (server/plan removeDeadlinesBySyllabus).
 */

const ExtractedDeadlineSubSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 120 },
    dueAt: { type: Date, required: true },
  },
  { _id: false },
);

const SyllabusSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    courseCode: { type: String, required: true },
    termCode: { type: String, required: true },
    filename: { type: String, required: true, maxlength: 200 },
    uploadedAt: { type: Date, default: Date.now },
    extractedDeadlines: { type: [ExtractedDeadlineSubSchema], default: [] },
  },
  { collection: "syllabi", timestamps: true },
);

SyllabusSchema.index({ userId: 1, courseCode: 1, termCode: 1 }, { unique: true });

export type SyllabusDoc = InferSchemaType<typeof SyllabusSchema>;
export type SyllabusDocument = HydratedDocument<SyllabusDoc>;

const Syllabus: Model<SyllabusDoc> =
  (mongoose.models.Syllabus as Model<SyllabusDoc> | undefined) ??
  mongoose.model<SyllabusDoc>("Syllabus", SyllabusSchema);

export default Syllabus;
