import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * A student's syllabi, one document per (student, course, term), collection `syllabi` (PLAN-UX §3). The pasted
 * text itself is never stored (server/syllabi/records.ts sends it to the AI extraction once, then drops it): this
 * document keeps only the course code, term, when it was added, and the deadlines the AI extracted from it.
 * Pasting again for the same course and term replaces this document (server/syllabi/records.ts
 * addSyllabusImpl); deleting it also removes the plan deadlines that trace back to it (server/plan
 * removeDeadlinesBySyllabus). Documents from the earlier file-upload version may still hold a `filename`
 * (and `uploadedAt`); they are read as `addedAt` and the filename is ignored.
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
    addedAt: { type: Date, required: true },
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
