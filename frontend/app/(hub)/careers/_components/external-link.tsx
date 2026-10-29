import type * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A link that leaves MakeItSo (PLAN §7 "Links": rel="noopener noreferrer"). Below 720px it is at least 44px tall
 * (PLAN §7 "Accessibility": tap targets); from 720px a plain inline link. The arrow stays with the last word when
 * the text wraps (text and arrow share one inline box). `newTab` opens it in a new tab and ends its accessible name
 * with the cue "(opens in a new tab)".
 */
export function ExternalLink({
  href,
  children,
  className,
  newTab = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  newTab?: boolean;
}) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      target={newTab ? "_blank" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-sm font-semibold link md:inline md:min-h-0",
        className,
      )}
    >
      <span>
        {children}
        <ArrowUpRight aria-hidden className="ml-0.5 inline size-3.5 align-[-0.125em]" />
        {newTab ? <span className="sr-only">&nbsp;(opens in a new tab)</span> : null}
      </span>
    </a>
  );
}
