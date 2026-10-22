import "server-only";
import { cache } from "react";
import type { FeedItem, LibraryHours } from "@/lib/types/feeds";
import { getLibraryHours, listEventsPage } from "@/server/feeds";
import { ApiError } from "@/server/http/errors";
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
 * The last successful sync of each event source (for the "as of" times and the not-synced-yet state), in
 * registry order. Memoised per request (React cache, keyed by the instant in ms), so the results and the Sources
 * card share one read.
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

export type LibraryHoursResult =
  { ok: true; hours: LibraryHours } | { ok: false; reason: "unavailable" };

/**
 * Today's LibCal hours (getLibraryHours: a stored snapshot, or one inline sync of at most 5 s when nothing is
 * stored for today). 404/503 and any other failure → unavailable (logged unless it is the expected 503/404).
 */
export async function loadLibraryHours(today: string): Promise<LibraryHoursResult> {
  try {
    return { ok: true, hours: await getLibraryHours(today) };
  } catch (error) {
    if (!(error instanceof ApiError && (error.status === 503 || error.status === 404))) {
      console.error("[events] library hours failed:", error);
    }
    return { ok: false, reason: "unavailable" };
  }
}
