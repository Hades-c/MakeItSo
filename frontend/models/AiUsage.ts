import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { AI_FEATURES } from "@/lib/types/ai";

/**
 * AI usage counters per America/New_York day, collection `aiusages` (owner W6). One document per
 * (day, userId, feature), incremented atomically (`updateOne` + `$inc`, upsert) by server/ai/usage.ts:
 *   - `generations`: model calls (cache misses; a retry after a grounding failure is a second call);
 *   - `regenerations`: personal regenerations the student asked for;
 *   - `cacheHits`: answers served from aicache_v2 without a model call;
 *   - `failures` / `fallbacks`: calls that ended in a failure kind / were served by the server-side fallback;
 *   - token counts (summed over `usage.iterations` when the API reports them, so declined attempts before a
 *     fallback count too) feed the AI_DAILY_TOKEN_BUDGET circuit breaker (sum over the day, all users);
 *   - `models`: the models that served this day's calls.
 *
 * `userId` is NOT the account id: it is a pseudonym, the first 12 bytes of sha256("makeitso:ai-usage:" + id) as an
 * ObjectId (server/ai/usage.ts usageSubject), so usage rows name no account directly; export and erasure recompute
 * it from the account id. Scheduled jobs count under the pseudonym of "system". (The field keeps the name `userId`
 * so the frozen (day, userId, feature) index stays as it is; see the W6 contract requests.) Quotas are enforced in
 * `ratelimits` (server/http consumeRateLimit), not here. Documents expire after 90 days.
 */
const AiUsageSchema = new Schema(
  {
    /** "YYYY-MM-DD" in America/New_York. */
    day: { type: String, required: true },
    /** Pseudonymous subject (see above), never the account id itself. */
    userId: { type: Schema.Types.ObjectId, required: true },
    feature: { type: String, enum: AI_FEATURES, required: true },
    generations: { type: Number, default: 0 },
    regenerations: { type: Number, default: 0 },
    cacheHits: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
    fallbacks: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheCreationTokens: { type: Number, default: 0 },
    models: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: "aiusages", timestamps: true },
);

AiUsageSchema.index({ day: 1, userId: 1, feature: 1 }, { unique: true });
AiUsageSchema.index({ userId: 1 });
AiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AiUsageDoc = InferSchemaType<typeof AiUsageSchema>;
export type AiUsageDocument = HydratedDocument<AiUsageDoc>;

const AiUsage: Model<AiUsageDoc> =
  (mongoose.models.AiUsage as Model<AiUsageDoc> | undefined) ??
  mongoose.model<AiUsageDoc>("AiUsage", AiUsageSchema);

export default AiUsage;
