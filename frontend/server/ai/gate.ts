import "server-only";
import mongoose from "mongoose";
import { getFlags, type Flags } from "@/lib/flags";
import type { AiFeature, AiGateInput } from "@/lib/types/ai";
import User from "@/models/User";
import { aiConfigured } from "@/server/ai/provider";
import { isVerifiedDavidsonUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { featureEnabled } from "@/server/features";

/**
 * What an AI route knows before it calls a model (lib/types/ai.ts aiGateFailure order: disabled →
 * not_configured → unverified → consent_required):
 *   enabled     AI_ENABLED, plus the section the feature lives in: careers for the career plan, alumni (which also
 *               needs careers) for the cold e-mail, RMP_SUMMARIES_ENABLED (which needs RMP_ENABLED) for professor
 *               summaries;
 *   configured  server/ai/provider.ts aiConfigured();
 *   verified    a verified @davidson.edu mailbox (server/auth isVerifiedDavidsonUser on the stored account);
 *   consented   aiConsentAt AND adultAttestedAt (the 18+ attestation, until the owner decides on minors).
 */

function validDate(value: unknown): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** AI_ENABLED and the flags of the section a feature belongs to. */
export function aiFeatureEnabled(flags: Flags, feature: AiFeature): boolean {
  if (!flags.ai) return false;
  switch (feature) {
    case "course-about":
    case "plan-suggestions":
      return true;
    case "career-plan":
      return featureEnabled(flags, "careers");
    case "cold-email":
      return featureEnabled(flags, "alumni");
    case "professor-summary":
      return flags.rmpSummaries;
  }
}

/** The gate input for a signed-in student (one read of the account). */
export async function aiGateInput(userId: string, feature: AiFeature): Promise<AiGateInput> {
  const enabled = aiFeatureEnabled(getFlags(), feature);
  const configured = enabled && aiConfigured();
  let verified = false;
  let consented = false;
  if (enabled && configured && mongoose.isValidObjectId(userId)) {
    await getDb();
    const doc = await User.findById(userId)
      .select("email emailVerifiedAt aiConsentAt adultAttestedAt")
      .lean();
    verified = isVerifiedDavidsonUser(doc ?? null);
    consented = !!doc && validDate(doc.aiConsentAt) && validDate(doc.adultAttestedAt);
  }
  return { enabled, configured, verified, consented };
}
