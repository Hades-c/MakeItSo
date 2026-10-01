"use client";

import * as React from "react";
import Link from "next/link";

/**
 * "Show in my week" (PLAN §7: URL state, keyboard first). The link sets ?crn= (a client navigation without the
 * default scroll-to-top); once the page shows the new section, WeekFocus scrolls the week card into view (no
 * smooth scrolling under prefers-reduced-motion) and moves focus to its heading, so keyboard and screen-reader
 * users land where the change is instead of on <body> (the link they used is replaced by "Shown in your week").
 */

let requestedAt = 0;
const REQUEST_TTL_MS = 15_000;

/** Exported for tests: whether a "Show in my week" navigation is waiting for its focus move. */
export function weekFocusPending(at = Date.now()): boolean {
  return requestedAt > 0 && at - requestedAt <= REQUEST_TTL_MS;
}

export function ShowInWeekLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        requestedAt = Date.now();
      }}
      className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary hover:underline md:min-h-0"
    >
      {children}
    </Link>
  );
}

/** Mounted once on the course page; runs when the chosen section changes. */
export function WeekFocus({ crn }: { crn: string | null }) {
  React.useEffect(() => {
    if (!weekFocusPending()) return;
    requestedAt = 0;
    const heading =
      document.getElementById("week-title") ??
      (crn ? document.getElementById(`section-${crn}-title`) : null);
    if (!heading) return;
    const target = heading.closest("section, article") ?? heading;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    target.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  }, [crn]);
  return null;
}
