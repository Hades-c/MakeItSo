import "server-only";
import { isDavidsonEmail } from "@/lib/api/account";
import type { AiFeature } from "@/lib/types/ai";
import { ALUMNI_VERIFIED_ONLY_MESSAGE, verifiedOnlyMessage } from "@/lib/types/ai-constants";
import { aiConfigured } from "@/server/ai/provider";
import { isVerifiedDavidsonUser, type VerifiableAccount } from "@/server/auth/session";
import { EnvError, readEnv } from "@/server/env";
import { loadFlags } from "@/server/features";

/**
 * Who counts as verified for AI (PLAN §1 capability gating), and the owner's TEMPORARY switch AI_ALLOW_UNVERIFIED
 * (server/env.ts; remove it, and this file's switch, once a mail provider can verify addresses, but KEEP the report
 * rule in server/ai/reports.ts: reports stored with `verified: false` outlive the switch, and REPORTER_COUNT must
 * keep leaving them out unless a migration deletes them first; docs/CONTRACTS.md "Removing the switch"):
 *
 *   isAiVerified(account, feature, allow)  THE rule: aiGateInput (every AI route) and every page that decides an AI
 *                                          gate itself use it, so pages and routes never disagree
 *   aiAllowsUnverified()                   the switch, for route paths (a malformed value throws EnvError → 500)
 *   loadAiAllowsUnverified()               the switch for pages and copy: never throws (malformed → off, logged)
 *   aiOpenWithoutVerifying(allow)          the switch AND AI working now: for copy that PROMISES AI without a
 *                                          verified address (copy that states the rule follows the switch)
 *   aiUnverifiedMessage(feature, allow)    what a student who is not verified for the feature is told
 *
 * With the switch on, an @davidson.edu account that has not verified its mailbox counts as verified for AI. Not
 * for cold e-mail (VERIFIED_ONLY_AI_FEATURES), and never for alumni data, which only verified viewers see (a legal
 * and privacy rule: server/content alumniForCareer, app/(hub)/alumni/_lib/access.ts). Legacy non-Davidson accounts
 * stay locked either way. Consent, the 18+ attestation, quotas and AI_DAILY_TOKEN_BUDGET are unchanged, and
 * reports from unverified accounts do not count toward hiding a shared answer (server/ai/reports.ts, permanent).
 */

/** AI features that stay verified-only whatever the switch says: they use alumni data. */
export const VERIFIED_ONLY_AI_FEATURES: readonly AiFeature[] = ["cold-email"];

/** AI_ALLOW_UNVERIFIED. Throws EnvError on a malformed value (routes answer 500, like getFlags()). */
export function aiAllowsUnverified(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return readEnv("AI_ALLOW_UNVERIFIED", source);
}

let warned = false;

/** AI_ALLOW_UNVERIFIED for pages and messages: a malformed value counts as off (logged once per process). */
export function loadAiAllowsUnverified(
  source: Record<string, string | undefined> = process.env,
): boolean {
  try {
    return aiAllowsUnverified(source);
  } catch (error) {
    if (!(error instanceof EnvError)) throw error;
    if (!warned) {
      warned = true;
      console.error(`[ai] ${error.problems.join("; ")}: treated as off`);
    }
    return false;
  }
}

/**
 * Whether AI works right now for an @davidson.edu account that has not verified its address: the switch is on AND
 * AI is (AI_ENABLED and a configured provider, what the landing's AI claim checks too). Copy that PROMISES AI
 * without verifying (verificationUnavailableMessage's "… the AI features in the meantime", the Profile AI note) is
 * chosen with this, never with the switch alone, so no page offers AI while AI is off or not set up. Copy that
 * states a RULE (verifiedOnlyMessage, aiUnverifiedMessage, what verifying opens in the verify banner and on
 * Profile, /privacy) follows the switch. Never throws.
 */
export function aiOpenWithoutVerifying(
  allowUnverified: boolean = loadAiAllowsUnverified(),
): boolean {
  return allowUnverified && loadFlags().ai && aiConfigured();
}

/**
 * Verified for an AI feature's gate: a verified @davidson.edu mailbox, always; an @davidson.edu address that is not
 * verified, only while the switch is on and never for a verified-only feature; anything else (legacy non-Davidson
 * accounts, verified or not; no account), never.
 */
export function isAiVerified(
  account: VerifiableAccount | null | undefined,
  feature: AiFeature,
  allowUnverified: boolean,
): boolean {
  if (isVerifiedDavidsonUser(account)) return true;
  return (
    allowUnverified &&
    !VERIFIED_ONLY_AI_FEATURES.includes(feature) &&
    isDavidsonEmail(account?.email ?? "")
  );
}

/** What a student who fails isAiVerified for `feature` is told, true in either state of the switch. */
export function aiUnverifiedMessage(feature: AiFeature, allowUnverified: boolean): string {
  return allowUnverified && VERIFIED_ONLY_AI_FEATURES.includes(feature)
    ? ALUMNI_VERIFIED_ONLY_MESSAGE
    : verifiedOnlyMessage(allowUnverified);
}
