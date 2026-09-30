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
  className?: string;
}

/** One error state for the whole app: says what failed and offers a retry. Announced to screen readers. */
export function ErrorState({
  title = "Something went wrong",
  description = "This part of MakeItSo could not load. Try again in a moment.",
  action,
  reference,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-xl border border-line bg-surface px-5 py-10 text-center shadow-card md:px-8 md:py-12",
        className,
      )}
    >
      <span className="mb-4 grid size-11 place-items-center rounded-lg bg-danger-wash text-danger">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <h2 className="text-lg font-strong tracking-title text-fg">{title}</h2>
      {description ? <p className="mt-1.5 max-w-prose text-sm text-fg-2">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
      {reference ? (
        <p className="mt-4 font-mono text-xs text-fg-3">Reference: {reference}</p>
      ) : null}
    </div>
  );
}
