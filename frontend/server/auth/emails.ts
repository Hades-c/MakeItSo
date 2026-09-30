import "server-only";
import { FORGOT_PASSWORD_PATH } from "@/app/(auth)/_lib/contracts";
import { routes } from "@/lib/routes";
import type { MailMessage } from "@/server/auth/mailer";
import { readEnv } from "@/server/env";

/**
 * The account e-mails (plain text). Every message says what MakeItSo is (an independent student project, not a
 * Davidson service) and what to do if the reader did not ask for it. None of them reveals anything the reader of
 * the inbox does not already own.
 */

const FOOTER = [
  "",
  "—",
  "MakeItSo is an independent student project for Davidson College students. It is not a Davidson College",
  "service, and it will never ask for your Davidson password.",
].join("\n");

/** The public origin for links in e-mails (APP_ORIGIN, else NEXTAUTH_URL, else the Vercel URL); null if unknown. */
export function appOriginForEmail(): string | null {
  const appOrigin = readEnv("APP_ORIGIN");
  if (appOrigin) return appOrigin;
  const nextAuthUrl = readEnv("NEXTAUTH_URL");
  if (nextAuthUrl) return new URL(nextAuthUrl).origin;
  const vercelUrl = readEnv("VERCEL_URL");
  return vercelUrl ? `https://${vercelUrl}` : null;
}

function link(path: string): string {
  const origin = appOriginForEmail();
  return origin ? `${origin}${path}` : `the ${path} page on MakeItSo`;
}

export function verificationEmail(to: string, code: string): MailMessage {
  return {
    kind: "verify-email",
    to,
    code,
    subject: "Your MakeItSo verification code",
    text: [
      `Your MakeItSo verification code is ${code}.`,
      "",
      `Enter it at ${link(routes.verify())} within 15 minutes. It works once.`,
      "",
      "If you did not create a MakeItSo account, ignore this e-mail: without this code nobody can verify",
      "this address.",
      FOOTER,
    ].join("\n"),
  };
}

export function alreadyRegisteredEmail(to: string): MailMessage {
  return {
    kind: "already-registered",
    to,
    subject: "You already have a MakeItSo account",
    text: [
      "Someone (probably you) tried to create a MakeItSo account with this address, but it already has one.",
      "",
      `Sign in at ${link(routes.login())}.`,
      `Forgot your password? Reset it at ${link(FORGOT_PASSWORD_PATH)}.`,
      "",
      "If this was not you, you can ignore this e-mail. Nothing about your account has changed.",
      FOOTER,
    ].join("\n"),
  };
}

export function signupPendingEmail(to: string): MailMessage {
  return {
    kind: "signup-pending",
    to,
    subject: "Your MakeItSo sign-up is waiting for verification",
    text: [
      "Someone tried to create a MakeItSo account with this address, but the address already has a sign-up",
      "that has not been verified yet.",
      "",
      "If you started it: sign in with the password you chose then, and verify the address at",
      `${link(routes.verify())} (you can ask for a new code there).`,
      "",
      `If you did not: reset the password at ${link(FORGOT_PASSWORD_PATH)}. Only someone who can read`,
      "this inbox can do that. It verifies the address and starts the account fresh: whatever the other",
      "person set up in it (name, profile, plan, AI consent) is deleted, and the account becomes yours.",
      FOOTER,
    ].join("\n"),
  };
}

export function passwordResetEmail(
  to: string,
  code: string,
  { pendingSignup = false }: { pendingSignup?: boolean } = {},
): MailMessage {
  return {
    kind: "reset-password",
    to,
    code,
    subject: "Reset your MakeItSo password",
    text: [
      `Your MakeItSo password reset code is ${code}.`,
      "",
      `Enter it at ${link(FORGOT_PASSWORD_PATH)} within 15 minutes, together with your new password.`,
      ...(pendingSignup
        ? [
            "",
            "The MakeItSo account for this address was created recently and has not been verified yet.",
            "Resetting the password verifies it and starts it fresh: anything set up in it so far (name,",
            "profile, plan, AI consent) is deleted, in case someone else created it with your address.",
          ]
        : []),
      "",
      "If you did not ask to reset your password, ignore this e-mail: your password has not changed.",
      FOOTER,
    ].join("\n"),
  };
}
