import type * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { dayKey, DEFAULT_TIME_ZONE, formatShortDate, formatTime } from "@/lib/format";
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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DOT: Record<SourceStatus | "never" | "curated", string> = {
  ok: "bg-success",
  stale: "bg-warning",
  error: "bg-danger",
  never: "bg-line-2",
  curated: "border-[1.5px] border-success",
};

/** What a synced source's status says before its time ("Synced 12:00 PM"), or on its own (no time). */
const STATUS_WORDS: Record<SourceStatus | "never", string> = {
  ok: "Synced",
  stale: "Out of date · last synced",
  error: "Sync failed",
  never: "Not synced yet",
};

/** When it last synced: the clock time today ("12:00 PM"), else the day ("Sep 29"). */
function syncedWhen(date: Date, now: Date, timeZone: string): string {
  return dayKey(date, timeZone) === dayKey(now, timeZone)
    ? formatTime(date, timeZone)
    : formatShortDate(date, timeZone);
}

export interface SourcesPanelProps {
  /** Only sources that really sync or were really verified; never placeholders. */
  sources: readonly SourceSync[];
  links?: readonly SourceLink[];
  now: Date;
  timeZone?: string;
  className?: string;
}

const HEADING = "mb-2 text-xs font-medium uppercase tracking-label text-fg-3";

/**
 * Sidebar "Sources" panel: every source MakeItSo aggregates with its real last-sync (or checked) time, and the
 * platforms it only links to, so the all-in-one promise is visible (Lakeside signature element). Data comes from
 * the server layout. Each time is said in words on screen, never only in a tooltip or to screen readers: "Synced
 * 12:00 PM", "Checked Sep 30", "Out of date · last synced Sep 29", "Sync failed", "Not synced yet".
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
        <ul className="flex flex-col gap-2 text-xs text-fg-2">
          {sources.map((source) => {
            const label = source.label ?? SOURCES[source.id].label;
            if (isCurated(source)) {
              const verified = validDate(source.verifiedAt);
              // A date-only value ("2026-09-30") parses as UTC midnight: format it in UTC, or the Davidson zone
              // shows the day before (PLAN §5: date stamps are UTC). A full timestamp uses the campus zone.
              const verifiedZone =
                typeof source.verifiedAt === "string" && DATE_ONLY.test(source.verifiedAt)
                  ? "UTC"
                  : timeZone;
              return (
                <SourceRow key={`${source.id}-${label}`} label={label} dot={DOT.curated}>
                  {verified ? (
                    <>
                      Checked{" "}
                      <time
                        dateTime={
                          verifiedZone === "UTC"
                            ? verified.toISOString().slice(0, 10)
                            : verified.toISOString()
                        }
                      >
                        {formatShortDate(verified, verifiedZone)}
                      </time>
                    </>
                  ) : null}
                </SourceRow>
              );
            }
            const lastSync = validDate(source.lastSync);
            // A failed sync says so even before the first success; otherwise no time means never synced.
            const state =
              source.status === "error"
                ? "error"
                : lastSync === null
                  ? "never"
                  : (source.status ?? "ok");
            const words = STATUS_WORDS[state];
            const time =
              lastSync && state !== "never" ? (
                <time dateTime={lastSync.toISOString()}>{syncedWhen(lastSync, now, timeZone)}</time>
              ) : null;
            return (
              <SourceRow key={`${source.id}-${label}`} label={label} dot={DOT[state]}>
                {time && state === "error" ? (
                  <>
                    {words} · last synced {time}
                  </>
                ) : time ? (
                  <>
                    {words} {time}
                  </>
                ) : (
                  words
                )}
              </SourceRow>
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
                    className="-mx-1 flex min-h-7 items-center gap-1.5 rounded-xs px-1 text-fg-2 hover:text-fg hover:underline"
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

/** One source: its status dot, its name, and under it the status and time in words. */
function SourceRow({
  label,
  dot,
  children,
}: {
  label: string;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className={cn("mt-1.25 size-1.75 shrink-0 rounded-full", dot)} />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {children ? (
          <span className="block text-fg-3">
            <span className="sr-only">, </span>
            {children}
          </span>
        ) : null}
      </span>
    </li>
  );
}
