import { SOURCES, type SourceId } from "@/lib/sources";
import { DEFAULT_TIME_ZONE, formatAsOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SourceTagProps {
  source: SourceId;
  /** When the data was fetched or last verified; shown as visible "as of <time>" text after the tag. */
  asOf?: Date | string | null;
  timeZone?: string;
  className?: string;
}

const TAG =
  "inline-flex items-center whitespace-nowrap rounded-xs border border-line-strong px-1.5 py-px text-xs leading-4 font-semibold uppercase tracking-label text-fg-2";

/**
 * Small uppercase tag naming where an aggregated item came from: HANDSHAKE, WILDCATSYNC, DAVIDSON ONE,
 * COURSE SITE, REGISTRAR, ... (Broadsheet idea). Every aggregated item renders one. The label is uppercased with
 * CSS so screen readers read the words, not letters.
 */
export function SourceTag({
  source,
  asOf,
  timeZone = DEFAULT_TIME_ZONE,
  className,
}: SourceTagProps) {
  const label = SOURCES[source].label;
  // An unparseable date drops the "as of" note rather than throwing from Intl.
  const asOfDate = asOf ? new Date(asOf) : null;
  const asOfText =
    asOfDate && !Number.isNaN(asOfDate.getTime())
      ? `as of ${formatAsOf(asOfDate, timeZone)}`
      : null;

  if (!asOfText) {
    return (
      <span className={cn(TAG, className)} data-source={source}>
        <span className="sr-only">Source: </span>
        {label}
      </span>
    );
  }

  // Visible text, not a tooltip: a hover or focus tooltip never opens on touch, so phone users would get no
  // freshness information (PLAN §7: no hover-only content), and the tag stays a plain label, not a small target.
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5", className)}>
      <span className={TAG} data-source={source}>
        <span className="sr-only">Source: </span>
        {label}
      </span>
      <span className="text-xs whitespace-nowrap text-fg-3" data-testid="source-as-of">
        <span className="sr-only">, </span>
        {asOfText}
      </span>
    </span>
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
