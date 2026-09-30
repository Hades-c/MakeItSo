import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { AI_FEATURES } from "@/lib/types/ai";

/**
 * AI output cache v2, collection `aicache_v2` (PLAN §6.1 W6; owner W6). The legacy `aicaches` collection is
 * read-only to new code and is never used.
 *
 * - scope "shared": course-about (per term + course) and professor-summary (per RMP profile); no user regenerate;
 *   refreshed when `inputHash` changes or at `expiresAt` (30 d / 7 d); hidden after 3 distinct reports.
 * - scope "user": personal outputs (plan suggestions, career plan, cold email) keyed by `userId`, 30 d.
 * `provenance` is what the UI shows ({model, promptVersion, inputHash, generatedAt}).
 */
const AiCacheSchema = new Schema(
  {
    feature: { type: String, enum: AI_FEATURES, required: true },
    scope: { type: String, enum: ["shared", "user"], required: true },
    /** null for shared entries. */
    userId: { type: Schema.Types.ObjectId, default: null },
    /** Feature-specific key, e.g. "202602:CSC 221" or an RMP legacyId. */
    key: { type: String, required: true },
    inputHash: { type: String, required: true },
    promptVersion: { type: String, required: true },
    /** Validated model output (the feature's zod schema from lib/types/ai.ts). */
    data: { type: Schema.Types.Mixed, required: true },
    provenance: {
      model: { type: String, required: true },
      promptVersion: { type: String, required: true },
      inputHash: { type: String, required: true },
      generatedAt: { type: Date, required: true },
    },
    fallbackUsed: { type: Boolean, default: false },
    reports: {
      count: { type: Number, default: 0 },
      userIds: { type: [Schema.Types.ObjectId], default: [] },
    },
    hidden: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { collection: "aicache_v2", timestamps: true },
);

AiCacheSchema.index({ feature: 1, scope: 1, userId: 1, key: 1 }, { unique: true });
AiCacheSchema.index({ userId: 1 });
AiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AiCacheDoc = InferSchemaType<typeof AiCacheSchema>;
export type AiCacheDocument = HydratedDocument<AiCacheDoc>;

const AiCache: Model<AiCacheDoc> =
  (mongoose.models.AiCache as Model<AiCacheDoc> | undefined) ??
  mongoose.model<AiCacheDoc>("AiCache", AiCacheSchema);

export default AiCache;
