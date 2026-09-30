import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * An Acalog catalog program page (PLAN §6.1 W1b; lib/types/catalog.ts AcademicProgram; owner W1b). Collection
 * `programs`, keyed by (catalogId, acalogId). Seeded from the checked-in snapshot and refreshed weekly; an ingest
 * with a non-200/WAF 202, an empty or non-JSON body, or fewer than 45 programs keeps the last good copy.
 */
const OfferingSubSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["major", "minor", "interdisciplinary-minor", "concentration", "other"],
      required: true,
    },
    name: { type: String, required: true },
    degree: { type: String, enum: ["B.A.", "B.S.", null], default: null },
    requirementsText: { type: String, default: "" },
    courseCodes: { type: [String], default: [] },
    acalogCoreId: { type: Number },
  },
  { _id: false },
);

const ProgramSchema = new Schema(
  {
    acalogId: { type: Number, required: true },
    catalogId: { type: Number, required: true },
    catalogYear: { type: String, required: true },
    name: { type: String, required: true },
    code: { type: String, default: "" },
    url: { type: String, required: true },
    offerings: { type: [OfferingSubSchema], default: [] },
    descriptionText: { type: String, default: "" },
    /** Acalog `modified` of the program page. */
    modifiedAt: { type: Date, default: null },
    fetchedAt: { type: Date, required: true },
  },
  { collection: "programs", timestamps: true },
);

ProgramSchema.index({ catalogId: 1, acalogId: 1 }, { unique: true });
ProgramSchema.index({ catalogYear: 1, name: 1 });
ProgramSchema.index({ "offerings.kind": 1, "offerings.name": 1 });

export type ProgramDoc = InferSchemaType<typeof ProgramSchema>;
export type ProgramDocument = HydratedDocument<ProgramDoc>;

const Program: Model<ProgramDoc> =
  (mongoose.models.Program as Model<ProgramDoc> | undefined) ??
  mongoose.model<ProgramDoc>("Program", ProgramSchema);

export default Program;
