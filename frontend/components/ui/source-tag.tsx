import { SOURCES, type SourceId } from "@/lib/sources";
import { DEFAULT_TIME_ZONE, formatAsOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export interface SourceTagProps {
  source: SourceId;
  /** When the data was fetched or last verified; shown as an "as of" tooltip and to screen readers. */
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
  const asOfText = asOf ? `as of ${formatAsOf(asOf, timeZone)}` : null;

  if (!asOfText) {
    return (
      <span className={cn(TAG, className)} data-source={source}>
        <span className="sr-only">Source: </span>
        {label}
      </span>
    );
  }

  return (
    <Tooltip content={`${label}, ${asOfText}`}>
      <span tabIndex={0} className={cn(TAG, "cursor-help", className)} data-source={source}>
        <span className="sr-only">Source: </span>
        {label}
        <span className="sr-only">, {asOfText}</span>
      </span>
    </Tooltip>
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
