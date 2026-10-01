"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * "Show more" and where keyboard focus goes after it. The link raises ?limit and unmounts once the last page is
 * shown, which would drop focus to <body>; instead, once the longer list has rendered, focus moves to the first
 * newly loaded item's link (the item at the old count, in the server's order). Module state, not React state: the list may remount
 * behind its Suspense boundary while the next page loads.
 */

let pendingFocusIndex: number | null = null;

/** The link of the item at `index` in the loaded page (EventRow sets data-event-index). */
export function eventLinkSelector(index: number): string {
  return `[data-event-index="${index}"] a[data-event-link]`;
}

export function ShowMoreLink({ href, count }: { href: string; count: number }) {
  return (
    <Button asChild variant="secondary">
      <Link
        href={href}
        scroll={false}
        onClick={() => {
          pendingFocusIndex = count;
        }}
      >
        Show more
      </Link>
    </Button>
  );
}

/** Rendered with every list (with or without a Show more link), so it is there when the longer list arrives. */
export function ShowMoreFocus({ count }: { count: number }) {
  useEffect(() => {
    const index = pendingFocusIndex;
    if (index === null || count <= index) return;
    pendingFocusIndex = null;
    document.querySelector<HTMLElement>(eventLinkSelector(index))?.focus();
  }, [count]);
  return null;
}

/** Test seam: forget a pending focus move. */
export function resetShowMoreFocus(): void {
  pendingFocusIndex = null;
}
