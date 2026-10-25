import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { isDavidsonEmail } from "@/lib/api/account";
import { routes } from "@/lib/routes";
import { verifiedOnlyMessage } from "@/lib/types/ai-constants";
import { aiOpenWithoutVerifying, loadAiAllowsUnverified } from "@/server/ai/access";
import { liveCode } from "@/server/auth/codes";
import { isMailAvailable } from "@/server/auth/mailer";
import {
  callbackPathFrom,
  firstParam,
  signedInUserOrNull,
  type SearchParams,
} from "@/server/auth/pages";
import { isEmailVerified } from "@/server/auth/session";
import { verificationUnavailableMessage } from "@/server/auth/verification";
import { now } from "@/server/clock";
import { VerifyForm } from "./_components/verify-form";

export const metadata: Metadata = { title: "Verify your email" };

/**
 * /verify (PLAN §1 compensating control): the signed-in account enters the 6-digit code sent to its address.
 * Any account may verify its own mailbox; only a verified @davidson.edu address unlocks alumni and AI (while the
 * temporary AI_ALLOW_UNVERIFIED switch is on, AI needs no verified address except for cold-email drafts, and the
 * page says so: the rule follows the switch, the "AI features in the meantime" offer also needs AI to be on and
 * set up, aiOpenWithoutVerifying), and requireUser({ verifiedDavidson: true }) sends other accounts here with
 * ?reason=davidson. `next` is where to go afterwards (same-origin only).
 *
 * The page only says a code was sent when there is a live one (VerificationCode for verify-email: unused,
 * unexpired, attempts left). Otherwise (legacy accounts, an expired code, a first send skipped by the 3-per-hour
 * limit) the primary action is "Email me a code".
 */

/** Whether a verification code is live (false when it cannot be checked: the form then offers to send one). */
async function hasLiveCode(userId: string): Promise<boolean> {
  try {
    return (await liveCode(userId, "verify-email", now())) !== null;
  } catch (error) {
    console.error("[auth] could not look up the verification code:", error);
    return false;
  }
}

export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const user = await signedInUserOrNull();
  if (!user) redirect(routes.login(routes.verify()));
  const next = callbackPathFrom(params.next);
  const gated = firstParam(params.reason) === "davidson";
  const davidson = isDavidsonEmail(user.email);
  const allowUnverifiedAi = loadAiAllowsUnverified();
  const lock = verifiedOnlyMessage(allowUnverifiedAi);
  const continueLink = (
    <Button asChild size="lg" className="w-full">
      <Link href={next}>Continue</Link>
    </Button>
  );

  if (isEmailVerified(user)) {
    return (
      <AuthCard title="Your email is verified" description={<>{user.email} is confirmed.</>}>
        <div className="flex flex-col gap-4">
          {davidson ? (
            <FormAlert tone="success">
              The alumni network and AI features are open to your account.
            </FormAlert>
          ) : (
            <FormAlert tone="info">{lock}</FormAlert>
          )}
          {continueLink}
        </div>
      </AuthCard>
    );
  }

  if (!isMailAvailable()) {
    return (
      <AuthCard title="Verify your email" description={<>Signed in as {user.email}.</>}>
        <div className="flex flex-col gap-4">
          <FormAlert tone="info" title="Verification is not available yet">
            {verificationUnavailableMessage(
              allowUnverifiedAi,
              aiOpenWithoutVerifying(allowUnverifiedAi),
            )}
          </FormAlert>
          {continueLink}
        </div>
      </AuthCard>
    );
  }

  return (
    <VerifyForm
      email={user.email}
      next={next}
      codeSent={await hasLiveCode(user.id)}
      notice={gated || !davidson ? lock : null}
    />
  );
}
