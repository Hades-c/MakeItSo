import "server-only";
import { isDavidsonEmail } from "@/lib/api/account";
import type { Flags } from "@/lib/flags";
import { verifiedOnlyMessage } from "@/lib/types/ai-constants";
import { aiOpenWithoutVerifying, loadAiAllowsUnverified } from "@/server/ai/access";
import { isEmailVerified, verifiedOnlyRedirect, type SessionUser } from "@/server/auth/session";
import { verificationUnavailableMessage } from "@/server/auth/verification";
import { featureEnabled } from "@/server/features";

/**
 * Who may see alumni data (PLAN §1 "Sign-up" capability gating, §9 "Flagged sections"): the Alumni section is on
 * (FEATURE_ALUMNI and FEATURE_CAREERS, featureEnabled(flags, "alumni")) AND the viewer is a verified @davidson.edu
 * account. Everyone else gets a short explanation instead of the data:
 *
 *   off            the section is switched off: show nothing about alumni, and no links to /alumni
 *   open           a verified @davidson.edu account: show the alumni
 *   verify         an @davidson.edu account that has not verified its mailbox (mail available or not)
 *   davidson-only  any other address (legacy non-Davidson accounts): verifying would not unlock alumni
 *
 * Decided on the server for every request; the data never reaches the browser otherwise. The temporary
 * AI_ALLOW_UNVERIFIED switch (server/ai/access.ts) never opens alumni: it changes only what the explanation says
 * about AI.
 */
export type AlumniAccess =
  | { kind: "off" }
  | { kind: "open" }
  | { kind: "verify"; mailAvailable: boolean }
  | { kind: "davidson-only" };

export function alumniAccessFor(
  user: Pick<SessionUser, "email" | "emailVerifiedAt"> | null,
  flags: Pick<Flags, "careers" | "events" | "alumni">,
  mailAvailable: () => boolean,
): AlumniAccess {
  if (!featureEnabled(flags, "alumni")) return { kind: "off" };
  if (!user || !isDavidsonEmail(user.email)) return { kind: "davidson-only" };
  if (!isEmailVerified(user)) return { kind: "verify", mailAvailable: mailAvailable() };
  return { kind: "open" };
}

/** What a closed alumni view says instead of the data, and the one next step (if any). */
export interface AlumniGateCopy {
  title: string;
  message: string;
  action: { href: string; label: string } | null;
}

/**
 * The explanation for a viewer who may not see alumni. `returnTo` is the page to come back to after verifying
 * (/verify?reason=davidson&next=<returnTo>). Legacy non-Davidson accounts get no verify button: verifying their
 * mailbox would not unlock alumni. `allowUnverifiedAi` (the switch) decides the rule the lock states; `aiOpen`
 * (aiOpenWithoutVerifying: the switch with AI on and set up) whether "no mail yet" may offer AI in the meantime.
 */
export function alumniGateCopy(
  access: Extract<AlumniAccess, { kind: "verify" | "davidson-only" }>,
  returnTo: string,
  allowUnverifiedAi: boolean = loadAiAllowsUnverified(),
  aiOpen: boolean = aiOpenWithoutVerifying(allowUnverifiedAi),
): AlumniGateCopy {
  const lock = verifiedOnlyMessage(allowUnverifiedAi);
  if (access.kind === "davidson-only") {
    return {
      title: "Alumni are for verified Davidson accounts",
      message: lock,
      action: null,
    };
  }
  if (!access.mailAvailable) {
    return {
      title: "Alumni open once your email is verified",
      message: verificationUnavailableMessage(allowUnverifiedAi, aiOpen),
      action: null,
    };
  }
  return {
    title: "Verify your Davidson email to see alumni",
    message: `${lock} Enter the code we email to your Davidson address to open them.`,
    action: { href: verifiedOnlyRedirect(returnTo), label: "Verify your email" },
  };
}
