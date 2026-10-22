import type * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  /** One line under the title (term, counts, context). */
  subtitle?: React.ReactNode;
  /** Small mono label above the title, e.g. "FALL 2026" or a breadcrumb. */
  kicker?: React.ReactNode;
  /** Buttons or controls, right-aligned on desktop and stacked under the title on phones. */
  actions?: React.ReactNode;
  className?: string;
}

/** Page title block used by every hub page (one pattern everywhere: audit design-visual/page-shell-ia-inconsistency). */
export function PageHeader({ title, subtitle, kicker, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-5 flex flex-col gap-3.5 md:flex-row md:items-end md:justify-between md:gap-5",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker ? (
          <p className="mb-1.5 font-mono text-xs font-medium tracking-label text-fg-3 uppercase">
            {kicker}
          </p>
        ) : null}
        <h1 className="text-xl font-strong text-fg md:text-2xl">{title}</h1>
        {subtitle ? (
          <p className="mt-1.5 text-sm text-fg-2 md:text-base [&_b]:font-semibold [&_b]:text-fg">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div> : null}
    </header>
  );
}
