import { ArrowUpRight } from "lucide-react";
import { DEFAULT_TIME_ZONE, formatAsOf, formatShortDate, formatSyncTime } from "@/lib/format";
import { SOURCES, type SourceId } from "@/lib/sources";
import { cn } from "@/lib/utils";

export type SourceStatus = "ok" | "stale" | "error";

/** A feed or API MakeItSo syncs itself. */
export interface SyncedSource {
  id: SourceId;
  /** Overrides the registry label (e.g. "Course schedule · Spring 2027"). */
  label?: string;
  /** Last successful sync; null when it has never synced. */
  lastSync: Date | string | null;
  status?: SourceStatus;
}

/** Hand-checked content (e.g. the academic calendar), shown with the date it was last verified. */
export interface CuratedSource {
  id: SourceId;
  label?: string;
  verifiedAt: Date | string;
}

/** A platform MakeItSo only links to (e.g. Handshake): no data is pulled, so no sync time is shown. */
export interface SourceLink {
  id: SourceId;
  label?: string;
  href: string;
}

export type SourceSync = SyncedSource | CuratedSource;

function isCurated(source: SourceSync): source is CuratedSource {
  return "verifiedAt" in source;
}

/** A usable date, or null. Intl throws on an invalid date, and this panel renders on every hub page. */
function validDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DOT: Record<SourceStatus | "never" | "curated", string> = {
  ok: "bg-success",
  stale: "bg-warning",
  error: "bg-danger",
  never: "bg-line-2",
  curated: "border-[1.5px] border-success",
};

const STATUS_TEXT: Record<SourceStatus | "never", string> = {
  ok: "synced",
  stale: "out of date",
  error: "sync failed",
  never: "not synced yet",
};

export interface SourcesPanelProps {
  /** Only sources that really sync or were really verified; never placeholders. */
  sources: readonly SourceSync[];
  links?: readonly SourceLink[];
  now: Date;
  timeZone?: string;
  className?: string;
}

const HEADING = "mb-2 font-mono text-xs font-medium uppercase tracking-label text-fg-3";

/**
 * Sidebar "Sources" panel: every source MakeItSo aggregates with its real last-sync (or verified) time, and the
 * platforms it only links to, so the all-in-one promise is visible (Lakeside signature element). Data comes from
 * the server layout.
 */
export function SourcesPanel({
  sources,
  links = [],
  now,
  timeZone = DEFAULT_TIME_ZONE,
  className,
}: SourcesPanelProps) {
  return (
    <section aria-labelledby="sources-heading" className={cn("px-3", className)}>
      <h2 id="sources-heading" className={HEADING}>
        Sources
      </h2>
      {sources.length === 0 ? (
        <p className="text-xs text-fg-3">No sources synced yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5 text-xs text-fg-2">
          {sources.map((source) => {
            const label = source.label ?? SOURCES[source.id].label;
            if (isCurated(source)) {
              const verified = validDate(source.verifiedAt);
              return (
                <li key={`${source.id}-${label}`} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn("size-1.75 shrink-0 rounded-full", DOT.curated)}
                  />
                  <span className="min-w-0 truncate">{label}</span>
                  {verified ? (
                    <>
                      <span className="sr-only">, verified</span>{" "}
                      <time
                        className="ml-auto shrink-0 font-mono text-fg-3"
                        dateTime={verified.toISOString()}
                        title={`Verified ${formatShortDate(verified, timeZone)}`}
                      >
                        {formatShortDate(verified, timeZone)}
                      </time>
                    </>
                  ) : null}
                </li>
              );
            }
            const lastSync = validDate(source.lastSync);
            const state = lastSync === null ? "never" : (source.status ?? "ok");
            return (
              <li key={`${source.id}-${label}`} className="flex items-center gap-2">
                <span aria-hidden className={cn("size-1.75 shrink-0 rounded-full", DOT[state])} />
                <span className="min-w-0 truncate">{label}</span>
                <span className="sr-only">, {STATUS_TEXT[state]},</span>{" "}
                <time
                  className="ml-auto shrink-0 font-mono text-fg-3"
                  dateTime={lastSync?.toISOString()}
                  title={lastSync ? formatAsOf(lastSync, timeZone) : undefined}
                >
                  {formatSyncTime(lastSync, now, timeZone)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
      {links.length > 0 ? (
        <>
          <h2 className={cn(HEADING, "mt-5")}>Links</h2>
          <ul className="flex flex-col gap-1 text-xs">
            {links.map((link) => {
              const label = link.label ?? SOURCES[link.id].label;
              return (
                <li key={`${link.id}-${link.href}`}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-mx-1 flex min-h-7 items-center gap-1.5 rounded-xs px-1 text-fg-2 hover:text-primary hover:underline"
                  >
                    {label}
                    <ArrowUpRight aria-hidden className="size-3.5 text-fg-3" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
