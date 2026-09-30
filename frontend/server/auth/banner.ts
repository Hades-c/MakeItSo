import "server-only";
import mongoose from "mongoose";
import { isDavidsonEmail } from "@/lib/api/account";
import User from "@/models/User";
import { isMailAvailable } from "@/server/auth/mailer";
import { REPLACE_UNVERIFIED_AFTER_MS } from "@/server/auth/registration";
import { isEmailVerified, type SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";

/**
 * What the hub's verify banner (app/(auth)/_components/verify-banner.tsx) shows for the signed-in user, or null
 * for no banner. Shown only to an unverified @davidson.edu account while mail is available (without a provider
 * there is nothing to do, and /verify explains why). Legacy non-Davidson accounts get no banner: verifying would
 * not unlock alumni or AI for them, and those pages say so themselves.
 *
 *   // app/(hub)/layout.tsx (orchestrator; contractRequest)
 *   const banner = await verifyBannerFor(user);
 *   <AppShell …>{banner ? <VerifyBanner {...banner} /> : null}{children}</AppShell>
 */
export interface VerifyBannerState {
  email: string;
  /**
   * True for a new sign-up that a later sign-up of the same address may replace: once a code was e-mailed to it,
   * 24 hours after that first code (User.verificationSentAt). Never before a code was sent.
   */
  replaceable: boolean;
  /** Hours of the 24 still left before that can happen (null when not replaceable). */
  hoursLeft: number | null;
}

export async function verifyBannerFor(
  user: SessionUser | null,
  at: Date,
): Promise<VerifyBannerState | null> {
  if (!user || isEmailVerified(user) || !isDavidsonEmail(user.email)) return null;
  if (!isMailAvailable()) return null;
  let replaceable = false;
  let hoursLeft: number | null = null;
  if (mongoose.isValidObjectId(user.id)) {
    await getDb();
    const doc = await User.findById(user.id)
      .select("emailVerifiedAt legacyAccount verificationSentAt")
      .lean();
    if (doc && isEmailVerified(doc)) return null;
    if (
      doc &&
      doc.emailVerifiedAt === null &&
      doc.legacyAccount !== true &&
      doc.verificationSentAt instanceof Date
    ) {
      replaceable = true;
      const leftMs = doc.verificationSentAt.getTime() + REPLACE_UNVERIFIED_AFTER_MS - at.getTime();
      hoursLeft = Math.max(0, Math.ceil(leftMs / 3_600_000));
    }
  }
  return { email: user.email, replaceable, hoursLeft };
}
