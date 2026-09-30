import type * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  title: React.ReactNode;
  /** Shown after the title in mono, e.g. a count ("4") or a range ("9a–4p"). */
  count?: React.ReactNode;
  /** Header link on the right, e.g. { href: "/events", label: "Events" }. */
  link?: { href: string; label: string };
  /** Used for the heading id and aria-labelledby. */
  id: string;
  className?: string;
  children: React.ReactNode;
}

/** Card with the Lakeside header row: "Title · count … link". Renders a labelled <section>. */
export function SectionCard({ title, count, link, id, className, children }: SectionCardProps) {
  const headingId = `${id}-title`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5",
        className,
      )}
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className="flex items-center gap-2 text-lg font-strong tracking-title text-fg"
        >
          {title}
          {count !== undefined && count !== null ? (
            <>
              {" "}
              <span className="font-mono text-xs font-medium text-fg-3">{count}</span>
            </>
          ) : null}
        </h2>
        {link ? (
          <Link
            href={link.href}
            className="-my-2 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary hover:underline md:min-h-0"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
