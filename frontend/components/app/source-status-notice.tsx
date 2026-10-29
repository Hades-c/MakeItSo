import { Notice } from "@/components/ui/notice";
import { dayKey, DEFAULT_TIME_ZONE, formatShortDate, formatTime } from "@/lib/format";

/** One source that is not current: out of date, or its last sync failed (null lastSync: it never succeeded). */
export interface SourceProblem {
  label: string;
  status: "stale" | "error";
  lastSync: Date | null;
}

/** When it last synced: the clock time today ("9:05 AM"), else the day ("Sep 29"). */
function syncedWhen(date: Date, now: Date, timeZone: string): string {
  return dayKey(date, timeZone) === dayKey(now, timeZone)
    ? formatTime(date, timeZone)
    : formatShortDate(date, timeZone);
}

/** "WildcatSync (last synced Sep 29)", "RateMyProfessors (sync failed, last synced Sep 22)", "… (not synced yet)". */
export function sourceProblemText(problem: SourceProblem, now: Date, timeZone: string): string {
  const when = problem.lastSync
    ? `last synced ${syncedWhen(problem.lastSync, now, timeZone)}`
    : null;
  if (problem.status === "stale") return `${problem.label} (${when ?? "not synced yet"})`;
  return `${problem.label} (${when ? `sync failed, ${when}` : "could not sync yet"})`;
}

/**
 * The shell's one freshness line (the sidebar's Sources panel is gone, so a failed sync has to show somewhere):
 * a warning above the page naming each source that is out of date or failing, in words. Renders nothing while
 * every source is current, which is nearly always.
 */
export function SourceStatusNotice({
  problems,
  now,
  timeZone = DEFAULT_TIME_ZONE,
}: {
  problems: readonly SourceProblem[];
  now: Date;
  timeZone?: string;
}) {
  if (problems.length === 0) return null;
  return (
    <Notice tone="warning" className="mb-4" data-testid="source-status-notice">
      Some information may be out of date:{" "}
      {problems.map((problem) => sourceProblemText(problem, now, timeZone)).join("; ")}.
    </Notice>
  );
}
