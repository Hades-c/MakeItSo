import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * An Acalog catalog program page (PLAN §6.1 W1b; lib/types/catalog.ts AcademicProgram; owner W1b). Collection
 * `programs`, one document per (catalogId, acalogId): a department or program page ("Computer Science",
 * "Classics") with its offerings (majors, minors, interdisciplinary minors).
 *
 * Two writers, both in server/programs:
 *   - the weekly list sync sets the list fields (name, legacyId, programTypes, listModified, listed,
 *     listSyncedAt) for every public program and `listed: false` for programs that left the catalog; a failed
 *     sync (non-200, WAF 202, empty/non-JSON body, fewer than 45 programs) writes nothing, so the last good copy
 *     stays;
 *   - a program page read (lazily, cached 7 days, or by the sync when Acalog's `modified` stamp changed) sets the
 *     detail fields (offerings with requirement sections, pageSections, elsewhereOfferings, descriptionText,
 *     detailModified, detailFetchedAt). A failed page read only records lastDetailError/lastDetailErrorAt, which
 *     also holds off the next attempt for a while (server/programs/catalog-info.ts PROGRAM_DETAIL_RETRY_MS).
 * Until the first successful list sync, the program set comes from the checked-in snapshot
 * (server/programs/snapshot.json) and documents here only add page details.
 */

/** A headed section of a program page; `text` is "" when the heading is itself the statement. */
const SectionSubSchema = new Schema(
  {
    heading: { type: String, default: "" },
    text: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * An offering this page states but another program page owns (FMDS's "Digital Studies Minor Requirements",
 * Classics' Greek minor): shown as a note on the owning page's offering.
 */
const ElsewhereSubSchema = new Schema(
  {
    family: { type: String, enum: ["major", "minor"], required: true },
    /** programKey of the subject; the owning page's offering has the same family and subject key. */
    subjectKey: { type: String, required: true },
    name: { type: String, required: true },
    text: { type: String, default: "" },
  },
  { _id: false },
);

const OfferingSubSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["major", "minor", "interdisciplinary-minor", "concentration", "other"],
      required: true,
    },
    /** Official name, e.g. "Major in Computer Science (B.S. Degree)". */
    name: { type: String, required: true },
    /** Acalog's degree words ("A.B.", "B.S.", "B.A. or B.S."); null when the heading names none. */
    degree: { type: String, default: null },
    /** Requirement text as headed sections (text only; AcademicProgram.requirementsText joins them). */
    sections: { type: [SectionSubSchema], default: [] },
    courseCodes: { type: [String], default: [] },
    /** Course links whose course Acalog does not name ("[course]" in the text). */
    missingCourseRefs: { type: Number, default: 0 },
    acalogCoreId: { type: Number },
  },
  { _id: false },
);

const ProgramSchema = new Schema(
  {
    acalogId: { type: Number, required: true },
    catalogId: { type: Number, required: true },
    /** "2026-2027". */
    catalogYear: { type: String, required: true },
    /** Acalog `legacy-id` (the `poid` of the public catalog page). */
    legacyId: { type: Number, default: null },
    name: { type: String, required: true },
    code: { type: String, default: "" },
    /** Public catalog page (https://catalog.davidson.edu/preview_program.php?catoid=…&poid=…). */
    url: { type: String, required: true },
    /** Acalog program types ("Interdisciplinary Minors", "Academic Courses/Major and Minor Requirements"). */
    programTypes: { type: [String], default: [] },

    // ---- List sync ----
    /** In the last good program list and public (active + visible). */
    listed: { type: Boolean, default: true },
    /** When a successful list sync last included this program; null until one did. */
    listSyncedAt: { type: Date, default: null },
    /** Acalog's `modified` stamp in the list ("2026-09-24 14:19:30", compared as a string). */
    listModified: { type: String, default: null },

    // ---- Program page ----
    offerings: { type: [OfferingSubSchema], default: [] },
    /**
     * The page's sections that belong to no offering (honors, course numbering, the department's course catalog,
     * college-wide requirements, other pages' offerings), so nothing on the page is lost.
     */
    pageSections: { type: [SectionSubSchema], default: [] },
    elsewhereOfferings: { type: [ElsewhereSubSchema], default: [] },
    descriptionText: { type: String, default: "" },
    /** Acalog's `modified` stamp of the page these offerings were parsed from. */
    detailModified: { type: String, default: null },
    /** When the page was last read successfully; null = offerings not parsed yet (the snapshot's are used). */
    detailFetchedAt: { type: Date, default: null },
    lastDetailError: { type: String, default: null },
    lastDetailErrorAt: { type: Date, default: null },

    /** Last write from upstream (list or page). */
    fetchedAt: { type: Date, required: true },
  },
  { collection: "programs", timestamps: true },
);

ProgramSchema.index({ catalogId: 1, acalogId: 1 }, { unique: true });
ProgramSchema.index({ catalogYear: 1, name: 1 });
ProgramSchema.index({ "offerings.kind": 1, "offerings.name": 1 });
ProgramSchema.index({ catalogId: 1, "elsewhereOfferings.subjectKey": 1 });

export type ProgramDoc = InferSchemaType<typeof ProgramSchema>;
export type ProgramDocument = HydratedDocument<ProgramDoc>;

const Program: Model<ProgramDoc> =
  (mongoose.models.Program as Model<ProgramDoc> | undefined) ??
  mongoose.model<ProgramDoc>("Program", ProgramSchema);

export default Program;
