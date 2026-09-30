import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * Catalog bookkeeping, collection `catalogmeta` (owner W1). One document per key:
 *   - `term:<code>`     per-term ingest state: counts, content hash, last success/error, the refresh lease, and
 *                       `data` = the department and requirement names seen in that term's payload (the fallback for
 *                       getCatalogFilters);
 *   - `terms`           the cached upstream terms list (`data`: normalised entries);
 *   - `filters:<code>`  the cached departments + requirements lists from the filters endpoint (`data`).
 *
 * Refresh rules (PLAN §5): past terms nightly (cron), active + registration every 15 min (stale-while-revalidate
 * via `after()`); the refresh takes a lease with an atomic `findOneAndUpdate` on `lockUntil < now` so concurrent
 * instances do not stampede upstream. Never replace a non-empty term with an empty or < 50%-size result (measured
 * against the larger of the stored count and `peakSectionCount`; a past term may not shrink by more than 10%):
 * keep the old rows, set `lastError`/`lastErrorAt` (and `rejectedCount`), and the UI shows "Schedule data as of
 * <lastSuccessAt>".
 *
 * Times: `lastSuccessAt` = the last refresh upstream answered and we accepted (the "as of" time, also when the
 * content was unchanged); `fetchedAt` = when the stored content was last written (it changed); `lastAttemptAt`
 * = the last try, successful or not.
 */
const CatalogMetaSchema = new Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: ["term", "terms", "filters"], required: true },
    termCode: { type: String, default: null },
    sectionCount: { type: Number, default: 0 },
    courseCount: { type: Number, default: 0 },
    /** Hash of the last accepted normalised payload (skip rewrites when unchanged; readers rebuild on change). */
    contentHash: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: null },
    /** Upstream pages the last accepted refresh read. */
    pageCount: { type: Number, default: 0 },
    /** Upstream items the last accepted refresh dropped as malformed. */
    invalidCount: { type: Number, default: 0 },
    /** Size of the last result the empty/< 50% guard rejected. */
    rejectedCount: { type: Number, default: null },
    /**
     * High-water mark of accepted section counts (the guard's baseline, so successive partial results cannot
     * shrink a term step by step) and when it was last reached; it lapses after PEAK_WINDOW_MS.
     */
    peakSectionCount: { type: Number, default: 0 },
    peakAt: { type: Date, default: null },
    fetchedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 500 },
    lockUntil: { type: Date, default: null },
    lockOwner: { type: String, default: null },
  },
  { collection: "catalogmeta", timestamps: true },
);

CatalogMetaSchema.index({ key: 1 }, { unique: true });
CatalogMetaSchema.index({ kind: 1, termCode: 1 });

export type CatalogMetaDoc = InferSchemaType<typeof CatalogMetaSchema>;
export type CatalogMetaDocument = HydratedDocument<CatalogMetaDoc>;

const CatalogMeta: Model<CatalogMetaDoc> =
  (mongoose.models.CatalogMeta as Model<CatalogMetaDoc> | undefined) ??
  mongoose.model<CatalogMetaDoc>("CatalogMeta", CatalogMetaSchema);

export default CatalogMeta;
