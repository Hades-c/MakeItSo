import type * as React from "react";
import { cn } from "@/lib/utils";

export interface ProfileSectionProps {
  /** Used for the section's id (the in-page links) and its heading id. */
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * One card per profile area: a labelled <section> with the Lakeside card look (server-compatible). Its in-page
 * link lands 1.5rem below the sticky top bar (html scroll-padding in app/globals.css clears the bar).
 */
export function ProfileSection({
  id,
  title,
  description,
  className,
  children,
}: ProfileSectionProps) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "min-w-0 scroll-mt-6 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5",
        className,
      )}
    >
      <h2 id={headingId} className="text-lg font-strong tracking-title text-fg">
        {title}
      </h2>
      {description ? <div className="mt-1 text-sm text-fg-2">{description}</div> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A read-only fact row: label on the left (mono), value on the right; stacks on phones. */
export function FactList({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-[10rem_minmax(0,1fr)]">{children}</dl>
  );
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-mono text-xs tracking-label text-fg-3 uppercase md:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </>
  );
}
