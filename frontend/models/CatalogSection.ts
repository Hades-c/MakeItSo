import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { MEETING_DAYS, REQ_CODES } from "@/lib/types/catalog";

/**
 * One section of one term from the Davidson course API, normalised (PLAN §4.1.2 Section; owner W1). Collection
 * `catalogsections`, keyed by (termCode, crn). A term is replaced as a whole by the ingest, and never by an empty
 * or < 50%-size result (PLAN §5 "Catalog ingest"; see CatalogMeta).
 *
 * `reqCodes` is absent when upstream has no requirement data (exposed as `null`), `[ "NONE" ]` when approved for
 * none. `noteCodes` keeps the raw upstream note codes so restrictions can be re-derived without re-fetching.
 * `searchText` is a lower-cased blob (code, title, instructors, description) for W1's search.
 */

const MeetingSubSchema = new Schema(
  {
    days: { type: [{ type: String, enum: MEETING_DAYS }], default: [] },
    start: { type: String, default: null },
    end: { type: String, default: null },
    building: { type: String },
    room: { type: String },
    kind: { type: String, enum: ["class", "second", "lab", "other"], required: true },
    tba: { type: Boolean, required: true },
  },
  { _id: false },
);

const InstructorSubSchema = new Schema(
  {
    first: { type: String, default: "" },
    last: { type: String, default: "" },
    isStaff: { type: Boolean, default: false },
  },
  { _id: false },
);

const CatalogSectionSchema = new Schema(
  {
    termCode: { type: String, required: true },
    crn: { type: String, required: true },
    courseCode: { type: String, required: true },
    /** Cross-listing canonical code (lib/types/catalog.ts canonicalCourseCode). */
    canonicalCode: { type: String, required: true },
    subject: { type: String, required: true },
    number: { type: String, required: true },
    section: { type: String, required: true },
    title: { type: String, required: true },
    credits: { type: Number, required: true, min: 0 },
    instructors: { type: [InstructorSubSchema], default: [] },
    meetings: { type: [MeetingSubSchema], default: [] },
    enrollment: {
      current: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      remaining: { type: Number, default: 0 },
    },
    reqCodes: { type: [{ type: String, enum: REQ_CODES }], default: undefined },
    prerequisitesText: { type: String, default: null },
    descriptionText: { type: String, default: "" },
    notes: { type: [String], default: [] },
    noteCodes: { type: [String], default: [] },
    restrictions: {
      eligibleYears: { type: [Number], default: undefined },
      untilFirstDay: { type: Boolean, default: false },
      permissionRequired: { type: Boolean, default: false },
      notIfCompMet: { type: Boolean, default: false },
    },
    crossListings: { type: [String], default: [] },
    crossPostings: { type: [String], default: [] },
    regFor: { type: String, default: null },
    searchText: { type: String, default: "" },
    /** When the ingest that wrote this row fetched it from upstream. */
    fetchedAt: { type: Date, required: true },
  },
  { collection: "catalogsections", timestamps: true },
);

CatalogSectionSchema.index({ termCode: 1, crn: 1 }, { unique: true });
CatalogSectionSchema.index({ termCode: 1, courseCode: 1 });
CatalogSectionSchema.index({ canonicalCode: 1, termCode: 1 });
CatalogSectionSchema.index({ termCode: 1, subject: 1, number: 1 });
CatalogSectionSchema.index({ termCode: 1, reqCodes: 1 });

export type CatalogSectionDoc = InferSchemaType<typeof CatalogSectionSchema>;
export type CatalogSectionDocument = HydratedDocument<CatalogSectionDoc>;

const CatalogSection: Model<CatalogSectionDoc> =
  (mongoose.models.CatalogSection as Model<CatalogSectionDoc> | undefined) ??
  mongoose.model<CatalogSectionDoc>("CatalogSection", CatalogSectionSchema);

export default CatalogSection;
