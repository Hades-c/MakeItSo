import type * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { SOURCES, type SourceId } from "@/lib/sources";
import { cn } from "@/lib/utils";

/**
 * Provenance, quietly (owner decision, 2026-10-28: "quiet labels, with minimal visual repetition"). No boxed tags:
 * the source is said in plain sentence-case words in the meta line an item already has, once per list where a
 * list has one source.
 *
 * - `SourceLine`: ONE quiet line for a single-source list or card ("Course schedule · seats as of Oct 28, 12:00
 *   PM"). Its container carries `provenance(ids)` (`data-provenance`), its rows `data-source`; the line names
 *   every id it lists (tests/e2e/helpers.ts expectAllAttributed, the L0 rule).
 * - `SourceNote`: one item's source inside its existing meta line, for mixed lists ("via Registrar", "via Office
 *   of Fellowships", "From your syllabus"). It carries `data-source` and the sr-only "Source:" prefix, so screen
 *   readers and tests get the source per item. `hidden` keeps only that sr-only text, for the rows after the
 *   first of a run of consecutive rows with the same label (`runHeads`): the run's first row says it once.
 */

export interface SourceNoteProps {
  source: SourceId;
  /** What the note says; default "via <source label>". */
  label?: string;
  /** Screen readers only (a row after the first of a run with the same label). */
  hidden?: boolean;
  className?: string;
}

/** "via Registrar": the default words of a SourceNote. */
export function viaLabel(source: SourceId, name?: string | null): string {
  return `via ${name ?? SOURCES[source].label}`;
}

export function SourceNote({ source, label, hidden = false, className }: SourceNoteProps) {
  const words = label ?? viaLabel(source);
  if (hidden) {
    return (
      <span className="sr-only" data-source={source} data-source-run="">
        Source: {words}
      </span>
    );
  }
  // font-sans: a note inside a font-display heading stays Inter, never Playfair.
  return (
    <span className={cn("font-sans text-fg-3", className)} data-source={source}>
      <span className="sr-only">Source: </span>
      {words}
    </span>
  );
}

/**
 * For each row of a list, whether it is the first of a run of consecutive rows with the same note (null: the row
 * has no visible note and breaks no run of its own). The rows that are not run heads render `SourceNote hidden`.
 */
export function runHeads(labels: readonly (string | null)[]): boolean[] {
  return labels.map((label, i) => label !== null && (i === 0 || labels[i - 1] !== label));
}

/** The container attribute that ties a list's rows to its SourceLine: `<ul {...provenance(["registrar"])}>`. */
export function provenance(sources: readonly SourceId[]): { "data-provenance": string } {
  return { "data-provenance": [...new Set(sources)].join(" ") };
}

/** ONE quiet line naming a list's or card's source (and its freshness), in sentence case. */
export function SourceLine({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  // "l0": the class the e2e provenance check looks for (tests/e2e/helpers.ts attributionReport).
  return (
    <p className={cn("l0 font-sans text-xs text-fg-3", className)} data-testid={testId}>
      {children}
    </p>
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
 * its source page: a note beside a separately worded link would say the source twice. It keeps the SourceNote
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
