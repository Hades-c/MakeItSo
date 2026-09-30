import Link from "next/link";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export interface VerifyBannerProps {
  email: string;
  /** A new, unverified sign-up: a later sign-up of the same address may replace it after 24 hours. */
  replaceable: boolean;
  /** Hours left of those 24 (null when not replaceable). */
  hoursLeft: number | null;
}

/**
 * The hub's "verify your email" banner (PLAN §6.1 W3). Server-compatible (no hooks). The hub layout renders it
 * above the page for an unverified @davidson.edu account while mail is available:
 *
 *   const banner = await verifyBannerFor(user, now());   // server/auth
 *   {banner ? <VerifyBanner {...banner} /> : null}
 */
export function VerifyBanner({ email, replaceable, hoursLeft }: VerifyBannerProps) {
  return (
    <section
      aria-labelledby="verify-banner-title"
      data-testid="verify-banner"
      className="mb-5 flex flex-col gap-3 rounded-xl border border-line bg-primary-wash p-4 md:flex-row md:items-center md:justify-between md:gap-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <MailWarning aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 text-sm">
          <h2 id="verify-banner-title" className="font-strong text-fg">
            Verify your Davidson email
          </h2>
          <p className="mt-0.5 text-fg-2">
            Enter the code we sent to{" "}
            <span className="font-semibold break-all text-fg">{email}</span> to open the alumni
            network and AI features.
            {replaceable ? (
              <>
                {" "}
                Until you do, a new sign-up with this address can replace this account
                {hoursLeft !== null && hoursLeft > 0
                  ? ` in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}`
                  : ""}
                .
              </>
            ) : null}
          </p>
        </div>
      </div>
      <Button asChild className="w-full md:w-auto">
        <Link href={routes.verify()}>Enter code</Link>
      </Button>
    </section>
  );
}
