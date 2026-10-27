import { ArrowUpRight } from "lucide-react";
import { SOURCES, type SourceId } from "@/lib/sources";
import { cn } from "@/lib/utils";

export interface SourceTagProps {
  source: SourceId;
  className?: string;
}

// font-sans: a tag inside a font-display heading ("Conflict check COURSE SCHEDULE") stays Inter, never Playfair.
const TAG =
  "inline-flex items-center whitespace-nowrap rounded-xs border border-line-strong px-1.5 py-px font-sans text-xs leading-4 font-semibold uppercase tracking-label text-fg-2";

/**
 * Small uppercase tag naming where an event item came from: HANDSHAKE, WILDCATSYNC, DAVIDSON ONE, COURSE SITE,
 * REGISTRAR, ... (Broadsheet idea). Every event item renders one. The label is uppercased with CSS so screen
 * readers read the words, not letters.
 */
export function SourceTag({ source, className }: SourceTagProps) {
  const label = SOURCES[source].label;
  return (
    <span className={cn(TAG, className)} data-source={source}>
      <span className="sr-only">Source: </span>
      {label}
    </span>
  );
}

export interface SourceLinkProps {
  source: SourceId;
  /** The item's own page at the source; the caller checks it (https, the source's host). null: plain text. */
  href: string | null;
  /** What the link opens, read after the source's name: "Arianna Smith’s page". */
  what?: string;
  className?: string;
}

/**
 * The source named once, as the link to the item's own page there ("RateMyProfessors ↗"), for an item that links
 * its source page: a SourceTag beside a separately worded link would say the source twice. It keeps the SourceTag
 * contract, `data-source` and the "Source: <label>" accessible name, and the link's name ends with the new-tab
 * cue. Without a link it is the same words as plain text.
 */
export function SourceLink({ source, href, what, className }: SourceLinkProps) {
  const label = SOURCES[source].label;
  if (!href) {
    return (
      <span className={className} data-source={source}>
        <span className="sr-only">Source: </span>
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-source={source}
      // The name in one string: browsers join hidden spans with or without spaces ("RateMyProfessors , …").
      aria-label={`Source: ${label}${what ? `, ${what}` : ""} (opens in a new tab)`}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-xs font-semibold link md:min-h-0",
        className,
      )}
    >
      <span className="sr-only">Source: </span>
      {label}
      <ArrowUpRight aria-hidden className="size-3.5" />
    </a>
  );
}

export interface SourceTagListProps {
  sources: readonly SourceId[];
  /** Accessible name for the list, e.g. "Sources for this page". */
  label: string;
  className?: string;
}

/** A wrapping row of source tags. */
export function SourceTagList({ sources, label, className }: SourceTagListProps) {
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {sources.map((source) => (
        <li key={source}>
          <SourceTag source={source} />
        </li>
      ))}
    </ul>
  );
}
