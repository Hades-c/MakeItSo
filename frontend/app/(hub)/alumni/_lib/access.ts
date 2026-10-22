import "server-only";
import { isDavidsonEmail, UNVERIFIED_MESSAGE } from "@/lib/api/account";
import type { Flags } from "@/lib/flags";
import { isEmailVerified, verifiedOnlyRedirect, type SessionUser } from "@/server/auth/session";
import { VERIFICATION_UNAVAILABLE_MESSAGE } from "@/server/auth/verification";
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
 * Decided on the server for every request; the data never reaches the browser otherwise.
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
 * mailbox would not unlock alumni.
 */
export function alumniGateCopy(
  access: Extract<AlumniAccess, { kind: "verify" | "davidson-only" }>,
  returnTo: string,
): AlumniGateCopy {
  if (access.kind === "davidson-only") {
    return {
      title: "Alumni are for verified Davidson accounts",
      message: UNVERIFIED_MESSAGE,
      action: null,
    };
  }
  if (!access.mailAvailable) {
    return {
      title: "Alumni open once your email is verified",
      message: VERIFICATION_UNAVAILABLE_MESSAGE,
      action: null,
    };
  }
  return {
    title: "Verify your Davidson email to see alumni",
    message: `${UNVERIFIED_MESSAGE} Enter the code we email to your Davidson address to open them.`,
    action: { href: verifiedOnlyRedirect(returnTo), label: "Verify your email" },
  };
}
