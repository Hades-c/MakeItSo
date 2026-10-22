"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { RESULTS_HEADING_ID, takeResultsFocusRequest } from "./clean-get-form";

/**
 * The /courses results heading ("1–20 of 214 courses in Spring 2027"), inside a polite live region that stays
 * mounted across searches, so a screen reader hears the new count; after a submitted search it takes focus
 * (tabIndex -1), so keyboard users continue at the results instead of the top of the page. In the empty and
 * error states it is visually hidden (the empty state says it on screen) but still announced.
 */
export function ResultsHeading({
  navKey,
  visible,
  className,
  children,
}: {
  /** The search URL: focus moves when it changes after a submit. */
  navKey: string;
  visible: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  React.useEffect(() => {
    if (takeResultsFocusRequest()) ref.current?.focus();
  }, [navKey]);
  // Hidden: a paragraph (the empty or error state carries the visible heading); the live region stays mounted.
  const Tag = visible ? "h2" : "p";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={visible ? "min-w-0" : "sr-only"}
    >
      <Tag
        ref={ref}
        id={RESULTS_HEADING_ID}
        tabIndex={-1}
        className={cn("scroll-mt-24", className)}
        data-testid={visible ? "results-count" : "results-status"}
      >
        {children}
      </Tag>
    </div>
  );
}
