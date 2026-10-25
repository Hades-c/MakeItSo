import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * The last run of the RateMyProfessors tag counts (server/rmp/tags.ts), collection `rmptagsyncs`, one document
 * (`key: "tags"`). Kept apart from the roster's `sourcesyncs` row so a tag run never hides a failing roster in the
 * Sources panel (or a failing tag run marks a good roster as failing). Holds no per-user data.
 */
const RmpTagSyncSchema = new Schema(
  {
    key: { type: String, enum: ["tags"], required: true },
    lastAttemptAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 500 },
    ok: { type: Boolean, default: false },
    consecutiveFailures: { type: Number, default: 0 },
    /** Teachers counted and stored by the last run. */
    lastUpdated: { type: Number, default: 0 },
    /** Teachers the last run skipped (an unusable answer): each waits out a backoff. */
    lastSkipped: { type: Number, default: 0 },
    /** GraphQL requests the last run sent. */
    lastRequests: { type: Number, default: 0 },
    /** Rated teachers still due after the last run. */
    remaining: { type: Number, default: 0 },
    /** The last run stopped at its time budget. */
    outOfTime: { type: Boolean, default: false },
  },
  { collection: "rmptagsyncs", timestamps: true },
);

RmpTagSyncSchema.index({ key: 1 }, { unique: true });

export type RmpTagSyncDoc = InferSchemaType<typeof RmpTagSyncSchema>;
export type RmpTagSyncDocument = HydratedDocument<RmpTagSyncDoc>;

const RmpTagSync: Model<RmpTagSyncDoc> =
  (mongoose.models.RmpTagSync as Model<RmpTagSyncDoc> | undefined) ??
  mongoose.model<RmpTagSyncDoc>("RmpTagSync", RmpTagSyncSchema);

export default RmpTagSync;
