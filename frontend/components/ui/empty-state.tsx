import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary next step (a Button, usually). */
  action?: React.ReactNode;
  /** Extra content under the description, e.g. the source tags this section will draw from. */
  children?: React.ReactNode;
  /** Heading level for the title (default h2). */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

/** One empty state for the whole app (audit design-visual/error-empty-states): icon, one-line cause, next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  as: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-line-2 bg-surface px-5 py-10 text-center md:px-8 md:py-12",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-4 grid size-11 place-items-center rounded-lg bg-surface-2 text-taupe">
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <Heading className="text-lg font-strong tracking-title text-fg">{title}</Heading>
      {description ? (
        <div className="mt-1.5 max-w-prose text-sm text-fg-2 [&_p+p]:mt-2">{description}</div>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
