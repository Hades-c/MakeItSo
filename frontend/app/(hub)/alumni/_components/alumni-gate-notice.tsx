import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export interface AlumniGateNoticeProps {
  title: string;
  message: string;
  action: { href: string; label: string } | null;
  /** "page": the /alumni page's empty state (h2). "inline": a short block inside a card (h3). */
  variant?: "page" | "inline";
  className?: string;
}

/**
 * What a viewer who may not see alumni gets instead (PLAN §1: alumni data needs a verified @davidson.edu account).
 * The copy comes from alumniGateCopy() on the server; no alumni data is rendered with it.
 */
export function AlumniGateNotice({
  title,
  message,
  action,
  variant = "page",
  className,
}: AlumniGateNoticeProps) {
  const button = action ? (
    <Button asChild variant={variant === "page" ? "primary" : "secondary"}>
      <Link href={action.href}>{action.label}</Link>
    </Button>
  ) : null;

  if (variant === "page") {
    return (
      <div data-testid="alumni-gate" className={className}>
        <EmptyState icon={Lock} title={title} description={<p>{message}</p>} action={button} />
      </div>
    );
  }
  return (
    <div
      data-testid="alumni-gate"
      className={cn("rounded-lg border border-dashed border-line-2 bg-surface-2 p-4", className)}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Lock aria-hidden className="size-4 text-taupe" />
        {title}
      </h3>
      <p className="mt-1 text-sm text-fg-2">{message}</p>
      {button ? <div className="mt-3">{button}</div> : null}
    </div>
  );
}
