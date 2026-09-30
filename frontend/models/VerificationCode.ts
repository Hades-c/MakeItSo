import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * Mailbox verification codes, collection `verificationcodes` (PLAN §1, §6.1 W3; owner W3). The 6-digit code is
 * stored only as a sha256 hash. One live code per (userId, purpose); a new send replaces it.
 * - Lifetime: 15 minutes. `expiresAt` is checked in code, and the TTL index then deletes the document.
 * - Attempts: 5 per code (`attempts`, reset by a new send).
 * - Sends: 3 per hour per user, enforced with `consumeRateLimit("verify-resend:user:<userId>", 3, 3600)` in the
 *   ratelimits collection (server/http/rate-limit.ts). NOT counted here: this document disappears with its
 *   15-minute code, so a counter in it would reset every 15 minutes and allow about 12 sends an hour.
 */
const VerificationCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    /** Normalised address the code was sent to. */
    email: { type: String, required: true },
    purpose: { type: String, enum: ["verify-email"], required: true, default: "verify-email" },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    /** When this code was sent (shown as "sent at …"; the resend limit lives in ratelimits). */
    lastSentAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
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
