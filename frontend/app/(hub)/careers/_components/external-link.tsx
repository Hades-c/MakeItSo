import type * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A link that leaves MakeItSo (PLAN §7 "Links": rel="noopener noreferrer"). Below 720px it is at least 44px tall
 * (PLAN §7 "Accessibility": tap targets); from 720px a plain inline link. The arrow stays with the last word when
 * the text wraps (text and arrow share one inline box).
 */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center rounded-sm font-semibold text-primary hover:underline md:inline md:min-h-0",
        className,
      )}
    >
      <span>
        {children}
        <ArrowUpRight aria-hidden className="ml-0.5 inline size-3.5 align-[-0.125em]" />
      </span>
    </a>
  );
}
