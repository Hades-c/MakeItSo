import Link from "next/link";
import { MailCheck } from "lucide-react";
import { queryString, routes } from "@/lib/routes";

/**
 * The one quiet line set-up shows a brand-new account (step 1, after /register sent it here with ?verify=sent):
 * registering e-mailed a 6-digit verification code, and /verify is where to enter it or ask for a new one. Its
 * `next` brings the student back to `returnTo` (the step, with set-up's own `?next=`) once verified. A plain
 * sentence, not a notice box: nothing is wrong, and verifying can wait (the catalog and the plan work without it;
 * the hub's verify banner keeps the reminder afterwards). The page decides when it shows (still unverified, mail
 * available); it says "code" because the e-mail carries a code, with a link to /verify.
 */
export function VerifySentNote({ email, returnTo }: { email: string; returnTo: string }) {
  return (
    <p data-testid="verify-sent-note" className="mb-4 flex items-start gap-2.5 text-sm text-fg-2">
      <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-2" />
      <span>
        We sent a verification code to <b className="font-semibold text-fg">{email}</b>.{" "}
        <Link
          href={`${routes.verify()}${queryString({ next: returnTo })}`}
          className="font-semibold link"
        >
          Enter the code
        </Link>{" "}
        now or later (you can ask for a new one there).
      </span>
    </p>
  );
}
