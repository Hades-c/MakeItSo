import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * Fixed-window rate-limit counters, collection `ratelimits` (PLAN §6.1 W3; owner W3). One document per
 * (key, windowStart), incremented atomically with `findOneAndUpdate({$inc}, {upsert})` (server/http/rate-limit.ts).
 * `expiresAt` = window end: the TTL index removes finished windows.
 *
 * Also holds the per-address sign-in backoff streaks (server/auth/rate-limits.ts): key
 * "login-backoff:email:<sha256>", windowStart fixed at the epoch, count = failures in the streak, expiresAt = last
 * failure + 24 h (the streak ends a day after the last failure).
 *
 * Keys that name a user ("<rule>:user:<id>") are that user's data: exported and erased with the account
 * (server/auth/account-data.ts).
 */
const RateLimitSchema = new Schema(
  {
    /** "<rule name>:<subject>", e.g. "login:ip:203.0.113.7" or "export:user:<id>". */
    key: { type: String, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: "ratelimits", timestamps: false },
);

RateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitDoc = InferSchemaType<typeof RateLimitSchema>;
export type RateLimitDocument = HydratedDocument<RateLimitDoc>;

const RateLimit: Model<RateLimitDoc> =
  (mongoose.models.RateLimit as Model<RateLimitDoc> | undefined) ??
  mongoose.model<RateLimitDoc>("RateLimit", RateLimitSchema);

export default RateLimit;
