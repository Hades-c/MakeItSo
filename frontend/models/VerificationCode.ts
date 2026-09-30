import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";

/**
 * Mailbox verification codes, collection `verificationcodes` (PLAN §1, §6.1 W3; owner W3). The 6-digit code is
 * stored only as a sha256 hash; 15-minute TTL (`expiresAt`), 5 attempts, 3 sends per hour. One live code per
 * (userId, purpose); a new send replaces it.
 */
const VerificationCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    /** Normalised address the code was sent to. */
    email: { type: String, required: true },
    purpose: { type: String, enum: ["verify-email"], required: true, default: "verify-email" },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    /** Sends in the current hour (for the 3/h resend limit). */
    sendCount: { type: Number, default: 1 },
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
