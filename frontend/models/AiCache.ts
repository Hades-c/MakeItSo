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
 * - scope "shared": course-about (key = the input hash: one entry per distinct official catalog text, so a course
 *   whose description did not change between terms shares its entry) and professor-summary (key "rmp:<legacyId>");
 *   no user regenerate; refreshed when `inputHash` changes or at `expiresAt` (30 d / 7 d); hidden after 3
 *   distinct reports ("Report this") until an admin purges it.
 * - scope "user": personal outputs (plan suggestions per target term, career plan per career slug, cold email per
 *   alumnus[:career]) keyed by `userId`, 30 d; a new input hash (the plan or profile changed) is a cache miss.
 * - status "refused" / "invalid": a negative entry (shared items only, 24 h) so a failing shared item is not
 *   regenerated on every view. `data` is null for those.
 * `provenance` is what the UI shows ({model, promptVersion, inputHash, generatedAt}); `model` is the model that
 * served the answer (after a server-side fallback, the fallback model).
 */
const AiCacheSchema = new Schema(
  {
    feature: { type: String, enum: AI_FEATURES, required: true },
    scope: { type: String, enum: ["shared", "user"], required: true },
    /** null for shared entries. */
    userId: { type: Schema.Types.ObjectId, default: null },
    /** Feature-specific key: an input hash (course-about), "rmp:<legacyId>", a term code, a slug. */
    key: { type: String, required: true },
    inputHash: { type: String, required: true },
    promptVersion: { type: String, required: true },
    status: { type: String, enum: ["ok", "refused", "invalid"], required: true },
    /** Validated, post-processed model output (null for negative entries). */
    data: { type: Schema.Types.Mixed, default: null },
    /** Negative entries: the student-facing failure message. */
    message: { type: String, default: null },
    provenance: {
      model: { type: String, required: true },
      promptVersion: { type: String, required: true },
      inputHash: { type: String, required: true },
      generatedAt: { type: Date, required: true },
    },
    fallbackUsed: { type: Boolean, default: false },
    /** "Report this" on shared entries: distinct reporters (the count is their number). */
    reports: {
      count: { type: Number, default: 0 },
      userIds: { type: [Schema.Types.ObjectId], default: [] },
      entries: {
        type: [
          new Schema(
            {
              userId: { type: Schema.Types.ObjectId, required: true },
              reason: { type: String, default: null },
              at: { type: Date, required: true },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },
    hidden: { type: Boolean, default: false },
    hiddenAt: { type: Date, default: null },
    /** Logical end of life, decided with server "now" (server/clock.ts): reads ignore the entry after it. */
    validUntil: { type: Date, required: true },
    /** TTL purge time: validUntil, pushed past the real clock when "now" is pinned in the past (tests). */
    expiresAt: { type: Date, required: true },
  },
  { collection: "aicache_v2", timestamps: true },
);

AiCacheSchema.index({ feature: 1, scope: 1, userId: 1, key: 1 }, { unique: true });
AiCacheSchema.index({ userId: 1 });
AiCacheSchema.index({ "reports.userIds": 1 });
AiCacheSchema.index({ feature: 1, inputHash: 1 });
AiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AiCacheDoc = InferSchemaType<typeof AiCacheSchema>;
export type AiCacheDocument = HydratedDocument<AiCacheDoc>;

const AiCache: Model<AiCacheDoc> =
  (mongoose.models.AiCache as Model<AiCacheDoc> | undefined) ??
  mongoose.model<AiCacheDoc>("AiCache", AiCacheSchema);

export default AiCache;
