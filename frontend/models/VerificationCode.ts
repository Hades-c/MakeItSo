import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * One-time e-mail codes, collection `verificationcodes` (PLAN §1, §6.1 W3; owner W3). The 6-digit code is stored
 * only as an HMAC-SHA256 hash (keyed with NEXTAUTH_SECRET, bound to the user and purpose: server/auth/codes.ts).
 * One live code per (userId, purpose); a new send replaces it.
 * - Purposes: "verify-email" (mailbox verification) and "reset-password" (Forgot password).
 * - Lifetime: 15 minutes. `codeExpiresAt` is that logical expiry, checked in code against server "now"
 *   (server/clock.ts). The document itself (only the hash, the address and the counters) is deleted by the TTL
 *   index on `expiresAt`, 24 hours after the send (PLAN §6.1 W3 retention "verification codes 24 h"). The two are
 *   separate on purpose: `expiresAt` is only a purge time that follows the real clock
 *   (server/auth/rate-limits.ts purgeTime), so a pinned FIXTURES_NOW in tests never lets the TTL monitor delete
 *   a code that is still live for the code under test.
 * - Attempts: 5 per code (`attempts`, incremented atomically before comparing; reset by a new send). On top of
 *   that, wrong codes of every purpose count against one per-account budget of 10 a day
 *   (`code-fail:user:<userId>` in ratelimits, server/auth/codes.ts).
 * - Sends: 3 per hour per user and purpose, enforced with `consumeRateLimit("verify-resend:user:<userId>", 3, 3600)`
 *   (and "reset-send:user:<userId>") in the ratelimits collection (server/http/rate-limit.ts). NOT counted here:
 *   this document disappears with its 15-minute code, so a counter in it would reset every 15 minutes and allow
 *   about 12 sends an hour.
 */
export const VERIFICATION_PURPOSES = ["verify-email", "reset-password"] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

const VerificationCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    /** Normalised address the code was sent to. */
    email: { type: String, required: true },
    purpose: { type: String, enum: VERIFICATION_PURPOSES, required: true, default: "verify-email" },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    /** When this code was sent (shown as "sent at …"; the resend limit lives in ratelimits). */
    lastSentAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    /** The code stops working at this time (15 minutes after the send, server "now"). */
    codeExpiresAt: { type: Date, required: true },
    /** TTL field: when the TTL monitor may delete this document (24 h after the send, real clock). */
    expiresAt: { type: Date, required: true },
  },
  { collection: "verificationcodes", timestamps: true },
);

VerificationCodeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type VerificationCodeDoc = InferSchemaType<typeof VerificationCodeSchema>;
export type VerificationCodeDocument = HydratedDocument<VerificationCodeDoc>;

const VerificationCode: Model<VerificationCodeDoc> =
  (mongoose.models.VerificationCode as Model<VerificationCodeDoc> | undefined) ??
  mongoose.model<VerificationCodeDoc>("VerificationCode", VerificationCodeSchema);

export default VerificationCode;
