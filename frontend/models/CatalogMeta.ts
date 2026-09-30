import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * Catalog bookkeeping, collection `catalogmeta` (owner W1). One document per key:
 *   - `term:<code>`     per-term ingest state (counts, last success/error, single-flight refresh lock);
 *   - `terms`           the cached upstream terms list (`data`);
 *   - `filters:<code>`  the cached departments + requirements lists (`data`).
 *
 * Refresh rules (PLAN §5): past terms nightly, active + registration every 15 min (stale-while-revalidate via
 * `after()`); take the lock with an atomic `findOneAndUpdate` on `lockUntil < now`. Never replace a non-empty term
 * with an empty or < 50%-size result: keep the old rows, set `lastError`/`lastErrorAt`, and the UI shows
 * "Schedule data as of <lastSuccessAt>".
 */
const CatalogMetaSchema = new Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: ["term", "terms", "filters"], required: true },
    termCode: { type: String, default: null },
    sectionCount: { type: Number, default: 0 },
    courseCount: { type: Number, default: 0 },
    /** Hash of the last accepted upstream payload (skip rewrites when unchanged). */
    contentHash: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: null },
    lastAttemptAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: null },
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
