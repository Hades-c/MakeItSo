import { SUPPORT_CONTACT } from "@/app/(auth)/_lib/support";
import { formatContentDate } from "@/app/(hub)/careers/_lib/format";
import { cn } from "@/lib/utils";

/**
 * The line every alumni view carries (PLAN §1 "Alumni"): "Compiled from public sources · checked <date> ·
 * Request removal/correction". The request goes to the project's support contact (W3's SUPPORT_CONTACT) until the
 * owner publishes an address.
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
      <a
        href={SUPPORT_CONTACT.url}
        rel="noopener noreferrer"
        className="font-semibold text-primary underline underline-offset-2"
      >
        Request removal/correction
      </a>
    </p>
  );
}
