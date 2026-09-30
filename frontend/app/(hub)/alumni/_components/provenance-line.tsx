import Link from "next/link";
import { formatContentDate } from "@/app/(hub)/careers/_lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Where "Request removal/correction" goes: the privacy notice's alumni section, which says how a listed person can
 * ask to be removed or corrected and not to post personal details in public. The only published contact today is
 * the project's public GitHub page, so a listed person is never sent there directly (contractRequest: a private
 * removal channel from the owner, PLAN §8).
 */
export const REMOVAL_HREF = `${routes.privacy()}#alumni`;

/**
 * The line every alumni view carries (PLAN §1 "Alumni"): "Compiled from public sources · checked <date> ·
 * Request removal/correction".
 */
export function ProvenanceLine({
  checkedAt,
  className,
}: {
  checkedAt: string;
  className?: string;
}) {
  return (
    <p className={cn("text-xs text-fg-3", className)} data-testid="alumni-provenance">
      Compiled from public sources · checked{" "}
      <time dateTime={checkedAt}>{formatContentDate(checkedAt)}</time> ·{" "}
      <Link href={REMOVAL_HREF} className="font-semibold text-primary underline underline-offset-2">
        Request removal/correction
      </Link>
    </p>
  );
}
