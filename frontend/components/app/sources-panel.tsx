import { DEFAULT_TIME_ZONE, formatAsOf, formatSyncTime } from "@/lib/format";
import { SOURCES, type SourceId } from "@/lib/sources";
import { cn } from "@/lib/utils";

export type SourceStatus = "ok" | "stale" | "error";

export interface SourceSync {
  id: SourceId;
  /** Overrides the registry label (e.g. "Course schedule · Spring 2027"). */
  label?: string;
  /** Last successful sync; null when it has never synced. */
  lastSync: Date | string | null;
  status?: SourceStatus;
}

const DOT: Record<SourceStatus | "never", string> = {
  ok: "bg-success",
  stale: "bg-warning",
  error: "bg-danger",
  never: "bg-line-2",
};

const STATUS_TEXT: Record<SourceStatus | "never", string> = {
  ok: "synced",
  stale: "out of date",
  error: "sync failed",
  never: "not synced yet",
};

export interface SourcesPanelProps {
  sources: readonly SourceSync[];
  now: Date;
  timeZone?: string;
  className?: string;
}

/**
 * Sidebar "Sources" panel: every feed MakeItSo aggregates and when it last synced, so the all-in-one promise is
 * visible (Lakeside signature element). Data comes from the server layout.
 */
export function SourcesPanel({
  sources,
  now,
  timeZone = DEFAULT_TIME_ZONE,
  className,
}: SourcesPanelProps) {
  return (
    <section aria-labelledby="sources-heading" className={cn("px-3", className)}>
      <h2
        id="sources-heading"
        className="mb-2 font-mono text-xs font-medium tracking-label text-fg-3 uppercase"
      >
        Sources
      </h2>
      {sources.length === 0 ? (
        <p className="text-xs text-fg-3">No sources synced yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5 text-xs text-fg-2">
          {sources.map((source) => {
            const state = source.lastSync === null ? "never" : (source.status ?? "ok");
            const label = source.label ?? SOURCES[source.id].label;
            return (
              <li key={`${source.id}-${label}`} className="flex items-center gap-2">
                <span aria-hidden className={cn("size-1.75 shrink-0 rounded-full", DOT[state])} />
                <span className="min-w-0 truncate">{label}</span>
                <span className="sr-only">, {STATUS_TEXT[state]},</span>{" "}
                <time
                  className="ml-auto shrink-0 font-mono text-fg-3"
                  dateTime={
                    source.lastSync === null ? undefined : new Date(source.lastSync).toISOString()
                  }
                  title={
                    source.lastSync === null ? undefined : formatAsOf(source.lastSync, timeZone)
                  }
                >
                  {formatSyncTime(source.lastSync, now, timeZone)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
