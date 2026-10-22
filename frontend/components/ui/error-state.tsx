import type * as React from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Retry or way out (Buttons). */
  action?: React.ReactNode;
  /** Error digest from Next.js, shown so a bug report can reference it. */
  reference?: string;
  /**
   * `page` (default): a centred card for a page or a whole section. `inline`: compact and left-aligned, on the
   * danger wash, for a failure inside a panel (an AI result, a form step).
   */
  variant?: "page" | "inline";
  /** The title's heading level, so the state fits the outline it is placed in (default 2). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

const LAYOUT = {
  page: {
    box: "items-center rounded-xl border-line bg-surface px-5 py-10 text-center shadow-card md:px-8 md:py-12",
    icon: "mb-4 size-11",
    title: "text-lg",
    actions: "mt-5 justify-center",
  },
  inline: {
    box: "items-start rounded-lg border-danger bg-danger-wash px-3.5 py-3.5 text-left",
    icon: "mb-2 size-8",
    title: "text-base",
    actions: "mt-3 justify-start",
  },
} as const;

/** One error state for the whole app: says what failed and offers a retry. Announced to screen readers. */
export function ErrorState({
  title = "Something went wrong",
  description = "This part of MakeItSo could not load. Try again in a moment.",
  action,
  reference,
  variant = "page",
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const layout = LAYOUT[variant];
  const Heading = `h${headingLevel}` as const;
  return (
    <div role="alert" className={cn("flex flex-col border", layout.box, className)}>
      <span
        className={cn("grid place-items-center rounded-lg bg-danger-wash text-danger", layout.icon)}
      >
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <Heading className={cn("font-strong tracking-title text-fg", layout.title)}>{title}</Heading>
      {description ? <p className="mt-1.5 max-w-prose text-sm text-fg-2">{description}</p> : null}
      {action ? <div className={cn("flex flex-wrap gap-2", layout.actions)}>{action}</div> : null}
      {reference ? (
        <p className="mt-4 font-mono text-xs text-fg-3">Reference: {reference}</p>
      ) : null}
    </div>
  );
}
