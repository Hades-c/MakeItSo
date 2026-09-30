import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { SYNCED_SOURCE_IDS } from "@/lib/sources";

/**
 * Last sync outcome per synced source (api/feed kinds), collection `sourcesyncs`. Written only through
 * `recordSync()` and read through `getSourceStatuses()` (server/sync.ts) for the Sources panel.
 */
const SourceSyncSchema = new Schema(
  {
    sourceId: { type: String, enum: SYNCED_SOURCE_IDS, required: true },
    lastAttemptAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 500 },
    /** Items in the last successful sync. */
    lastCount: { type: Number, default: 0 },
    ok: { type: Boolean, default: false },
    consecutiveFailures: { type: Number, default: 0 },
  },
  { collection: "sourcesyncs", timestamps: true },
);

SourceSyncSchema.index({ sourceId: 1 }, { unique: true });

export type SourceSyncDoc = InferSchemaType<typeof SourceSyncSchema>;
export type SourceSyncDocument = HydratedDocument<SourceSyncDoc>;

const SourceSync: Model<SourceSyncDoc> =
  (mongoose.models.SourceSync as Model<SourceSyncDoc> | undefined) ??
  mongoose.model<SourceSyncDoc>("SourceSync", SourceSyncSchema);

export default SourceSync;
