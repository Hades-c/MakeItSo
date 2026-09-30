import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * Fixed-window rate-limit counters, collection `ratelimits` (PLAN §6.1 W3; owner W3). One document per
 * (key, windowStart), incremented atomically with `findOneAndUpdate({$inc}, {upsert})` (server/http/rate-limit.ts).
 * `expiresAt` = window end: the TTL index removes finished windows. It is only a purge time: decisions are made
 * from windowStart / the fields below with server "now", and W3 pushes `expiresAt` out when "now" is pinned in
 * the past (server/auth/rate-limits.ts purgeTime), so the TTL monitor never deletes a live counter in tests.
 *
 * Also holds, with windowStart fixed at the epoch (server/auth/rate-limits.ts):
 *   - sign-in backoff streaks: "login-backoff:email:<sha256>" (address-wide) and
 *     "login-backoff:email:<sha256>:ip:<sha256>" (address + client IP); count = failures in the streak,
 *     `lastFailureAt` = the last one (the streak ends 24 h later), expiresAt = purge time;
 *   - "login-ok:email:<sha256>:ip:<sha256>": this IP signed in to the address (`lastSignInAt`, kept 30 days).
 * The wrong-code budget is an ordinary window: "code-fail:user:<id>", 10 a day.
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
    /** Streak documents only: the last failed sign-in (logical time). */
    lastFailureAt: { type: Date },
    /** "login-ok" documents only: the last successful sign-in from that IP. */
    lastSignInAt: { type: Date },
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
