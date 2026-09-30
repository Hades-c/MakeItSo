import type * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A link that leaves MakeItSo (PLAN §7 "Links": rel="noopener noreferrer"). The arrow stays with the last word
 * when the text wraps.
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
      className={cn("rounded-sm font-semibold text-primary hover:underline", className)}
    >
      {children}
      <ArrowUpRight aria-hidden className="ml-0.5 inline size-3.5 align-[-0.125em]" />
    </a>
  );
}
