import "server-only";
import { cache } from "react";
import type { FeedItem } from "@/lib/types/feeds";
import { listEventsPage } from "@/server/feeds";
import { getSourceStatuses, type SourceSyncState } from "@/server/sync";
import { EVENT_SOURCE_IDS, type EventSourceId, type EventsView } from "./params";
import type { EventsWindow } from "./range";

/**
 * Server reads for /events. Every one goes through the feeds service (server/feeds: reads never wait for an
 * upstream, stale sources refresh after the response) or the sync bookkeeping (server/sync), and none throws for
 * an expected outage: the page shows an error, "unavailable" or "not synced yet" state instead.
 */

export interface EventsResult {
  items: FeedItem[];
  /** More items match than `view.limit` returned (the "Show more" link). */
  hasMore: boolean;
}

/** One page of feed items for the view's window and filters (listEventsPage: soonest first, overlap rules). */
export async function loadEvents(view: EventsView, window: EventsWindow): Promise<EventsResult> {
  const { items, hasMore } = await listEventsPage({
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    sources: view.sources,
    kinds: view.kinds,
    q: view.q,
    limit: view.limit,
  });
  return { items, hasMore };
}

export interface EventSourceStatus {
  id: EventSourceId;
  /** Last successful sync (ISO); null when the source never synced. */
  lastSync: string | null;
  status: SourceSyncState | "never";
}

/**
 * The last successful sync of each event source (for the not-synced-yet empty state), in registry order.
 * Memoised per request (React cache, keyed by the instant in ms).
 */
export const loadEventSourceStatuses = cache(async (atMs: number): Promise<EventSourceStatus[]> => {
  const rows = new Map((await getSourceStatuses(new Date(atMs))).map((row) => [row.id, row]));
  return EVENT_SOURCE_IDS.map((id) => {
    const row = rows.get(id);
    return {
      id,
      lastSync: row?.lastSync?.toISOString() ?? null,
      status: row ? row.status : "never",
    };
  });
});

/** The statuses of the sources a view asks for (every event source when it names none). */
export function statusesFor(
  statuses: readonly EventSourceStatus[],
  view: Pick<EventsView, "sources">,
): EventSourceStatus[] {
  return view.sources.length === 0
    ? [...statuses]
    : statuses.filter((row) => view.sources.includes(row.id));
}
