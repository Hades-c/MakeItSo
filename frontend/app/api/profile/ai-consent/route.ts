import { authExtraApi } from "@/app/(auth)/_lib/contracts";
import { grantAiConsent, revokeAiConsent } from "@/server/auth";
import { defineRoute } from "@/server/http";

/**
 * The dedicated AI consent endpoint (PLAN §1 "AI is opt-in per user"). PUT `{ adultAttested: true }` records the
 * 18+ attestation and the consent (aiConsentAt, adultAttestedAt; kept if already set); DELETE is "Turn off AI
 * features" (clears aiConsentAt). Both answer the updated profile. PATCH /api/profile `aiConsent` does the same.
 */
export const PUT = defineRoute(authExtraApi.grantAiConsent, async ({ user }) => ({
  profile: await grantAiConsent(user.id),
}));

export const DELETE = defineRoute(authExtraApi.revokeAiConsent, async ({ user }) => ({
  profile: await revokeAiConsent(user.id),
}));
