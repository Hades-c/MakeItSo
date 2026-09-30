import type * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import type { DaySummary } from "@/lib/day-summary";
import { DEFAULT_TIME_ZONE, dayKey, formatLongDate } from "@/lib/format";

export interface DayHeadlineProps {
  now: Date;
  timeZone?: string;
  /** e.g. "Fall 2026". */
  termLabel?: string;
  summary: DaySummary;
  actions?: React.ReactNode;
}

/**
 * The Today headline (Broadsheet idea): the date as a mono kicker and a one-sentence, deterministic summary of the
 * day as the page title. Render on the server so the sentence and the date use APP_TIMEZONE.
 */
export function DayHeadline({
  now,
  timeZone = DEFAULT_TIME_ZONE,
  termLabel,
  summary,
  actions,
}: DayHeadlineProps) {
  return (
    <PageHeader
      kicker={
        <>
          <time dateTime={dayKey(now, timeZone)}>{formatLongDate(now, timeZone)}</time>
          {termLabel ? ` · ${termLabel}` : null}
        </>
      }
      title={<span data-testid="day-summary">{summary.sentence}</span>}
      actions={actions}
    />
  );
}
