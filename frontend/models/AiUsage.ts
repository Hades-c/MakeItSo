import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { AI_FEATURES } from "@/lib/types/ai";

/**
 * AI usage counters per America/New_York day, collection `aiusages` (owner W6). One document per
 * (day, userId, feature), incremented atomically (`findOneAndUpdate` + `$inc`, upsert):
 *   - `generations`: cache-miss generations (20/user/day across features; a global miss counts for the requester);
 *   - `regenerations`: personal regenerations (3/day);
 *   - token counts feed the AI_DAILY_TOKEN_BUDGET circuit breaker (sum over the day).
 * Documents expire after 90 days.
 */
const AiUsageSchema = new Schema(
  {
    /** "YYYY-MM-DD" in America/New_York. */
    day: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    feature: { type: String, enum: AI_FEATURES, required: true },
    generations: { type: Number, default: 0 },
    regenerations: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
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
