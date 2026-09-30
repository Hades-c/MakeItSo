import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { SUPPORT_CONTACT } from "@/app/(auth)/_lib/support";
import { routes } from "@/lib/routes";
import { isMailAvailable } from "@/server/auth/mailer";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * /forgot-password: with a mail provider, a reset code by e-mail (server/auth/password-reset.ts); without one,
 * how to reach the maintainers (nobody can prove they own an address without mail, so there is no self-service
 * reset until the owner configures a provider).
 */
export default async function ForgotPasswordPage() {
  // The mail provider is runtime configuration: never decide it at build time.
  await connection();
  if (isMailAvailable()) return <ForgotPasswordForm />;
  return (
    <AuthCard
      title="Forgot your password?"
      description="Password reset by email is not available yet."
      footer={
        <Link href={routes.login()} className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-fg-2">
        <FormAlert tone="info" title="Contact the maintainers">
          <p>
            MakeItSo cannot email you a reset code yet. Reach the people who run it through{" "}
            <a
              href={SUPPORT_CONTACT.url}
              className="font-semibold text-primary underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              {SUPPORT_CONTACT.label}
            </a>{" "}
            and say which email address your account uses.
          </p>
        </FormAlert>
        <p>
          Never share your password (MakeItSo or Davidson) with anyone, and do not post your email
          address in a public issue: ask for a private way to get in touch instead.
        </p>
      </div>
    </AuthCard>
  );
}
