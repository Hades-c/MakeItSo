import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { formatAsOf } from "@/lib/format";
import { loadEventSourceStatuses, type EventSourceStatus } from "../_lib/load";

/**
 * When each events calendar was last read (PLAN §3 Sources, §5 "Sources (truthfulness)"): the real last successful
 * sync from server/sync, "not synced yet" before the first one, and a note when the latest attempts failed (the
 * last good items stay listed).
 */

export interface EventSourcesCardProps {
  now: Date;
  timeZone: string;
}

export async function EventSourcesCard({ now, timeZone }: EventSourcesCardProps) {
  let statuses: EventSourceStatus[] | null;
  try {
    statuses = await loadEventSourceStatuses(now.getTime());
  } catch (error) {
    console.error("[events] could not read source statuses:", error);
    statuses = null;
  }
  return <EventSourcesView statuses={statuses} timeZone={timeZone} />;
}

function statusText(row: EventSourceStatus, timeZone: string): string {
  if (row.lastSync === null) return row.status === "error" ? "Not reachable yet" : "Not synced yet";
  const asOf = `as of ${formatAsOf(row.lastSync, timeZone)}`;
  if (row.status === "error") return `${asOf} · the latest check failed`;
  if (row.status === "stale") return `${asOf} · out of date`;
  return asOf;
}

export function EventSourcesView({
  statuses,
  timeZone,
}: {
  statuses: readonly EventSourceStatus[] | null;
  timeZone: string;
}) {
  return (
    <SectionCard id="event-sources" title="Calendars">
      {statuses ? (
        <ul className="divide-y divide-line" data-testid="event-sources">
          {statuses.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
            >
              <SourceTag source={row.id} />
              <span className="text-fg-2">{statusText(row, timeZone)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-2">Sync times are unavailable right now.</p>
      )}
      <p className="mt-3 text-xs text-fg-3">
        Every event links to the calendar it came from: check the details there before you go.
      </p>
    </SectionCard>
  );
}
