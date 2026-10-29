import "server-only";
import { after } from "next/server";
import * as z from "zod";
import { queryInt, queryList, queryText } from "@/lib/types/common";
import {
  EventsQuerySchema,
  FEED_SOURCE_IDS,
  FeedSourceIdSchema,
  type EventsQueryInput,
  type FeedItem as FeedItemWire,
  type FeedKind,
  type FeedSourceId,
} from "@/lib/types/feeds";
import type { QueryFilter } from "mongoose";
import FeedItem, { type FeedItemDoc } from "@/models/FeedItem";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { readEnv } from "@/server/env";
import { groupListings, MERGE_WINDOW_MS } from "@/server/feeds/merge";
import { toFeedItem, WIRE_PROJECTION } from "@/server/feeds/store";
import { staleSources, syncFeeds } from "@/server/feeds/sync";
import { escapeRegExp, foldForSearch } from "@/server/feeds/text";
import { DAY_MS, HOUR_MS } from "@/server/feeds/time";
import { ApiError, zodIssues } from "@/server/http/errors";

/**
 * Read side of the feeds service. Reads never wait for an upstream: they serve what `feeditems` holds and, when a
 * requested source is older than its freshness window (30–60 min), schedule a background refresh with next/server
 * `after()` (stale-while-revalidate; a no-op outside a request, e.g. in tests and scripts).
 */

/** Kinds listEvents returns when `kinds` is empty: events and deadlines (news only when asked). */
export const DEFAULT_EVENT_KINDS: readonly FeedKind[] = ["event", "deadline"];
export const DEFAULT_EVENTS_WINDOW_DAYS = 14;
/**
 * An event without an end time (the Events Digest gives none) counts as running this long for window overlap, so
 * it does not drop out of listEvents the moment it starts. Its endsAt stays null (nothing invented for display).
 */
export const OPEN_ENDED_EVENT_MS = 2 * HOUR_MS;

export interface ReadOptions {
  /** Schedule a background refresh of stale sources (default true). */
  refresh?: boolean;
}

/** Refresh stale sources after the response is sent. Outside a Next.js request scope this does nothing. */
export function scheduleStaleRefresh(sources: readonly FeedSourceId[]): void {
  if (sources.length === 0) return;
  try {
    after(async () => {
      try {
        await syncFeeds({ sources: [...sources], onlyStale: true });
      } catch (error) {
        console.error("[feeds] background refresh failed:", error);
      }
    });
  } catch {
    // Not inside a request (tests, scripts, build): the cron route keeps the feeds fresh.
  }
}

function invalid(error: z.ZodError): never {
  throw new ApiError(400, "validation_failed", "Some fields are invalid.", zodIssues(error));
}

function textFilter(q: string) {
  const tokens = foldForSearch(q).split(" ").filter(Boolean).slice(0, 8);
  return tokens.map((token) => ({ searchText: trusted({ $regex: escapeRegExp(token) }) }));
}

export interface EventsPage {
  items: FeedItemWire[];
  /** More items match than `limit` returned. */
  hasMore: boolean;
}

/**
 * Stored feed items overlapping [from, to) (default now → now + 14 days), soonest first, plus whether the list
 * was cut at `limit`. `kinds` defaults to events + deadlines; `sources` to every feed source; `q` matches title,
 * location and summary (every word, case and accent insensitive). Overlap: startsAt < to, and endsAt > from, or
 * (no end) startsAt ≥ from, or (an event without an end) startsAt > from − OPEN_ENDED_EVENT_MS. Items without a
 * start time (undated news) never match a window. One event listed by several sources counts and shows once, as
 * its host office's listing (server/feeds/merge.ts); `limit` and `hasMore` count events, not listings.
 */
export async function listEventsPage(
  query: EventsQueryInput = {},
  options: ReadOptions = {},
): Promise<EventsPage> {
  const parsed = EventsQuerySchema.safeParse(query);
  if (!parsed.success) invalid(parsed.error);
  const { from: fromIso, to: toIso, sources, kinds, q, limit } = parsed.data;
  const current = now();
  const from = fromIso ? new Date(fromIso) : current;
  const to = toIso
    ? new Date(toIso)
    : new Date(from.getTime() + DEFAULT_EVENTS_WINDOW_DAYS * DAY_MS);
  if (to.getTime() <= from.getTime()) {
    throw new ApiError(400, "validation_failed", "Some fields are invalid.", [
      { path: "to", message: "must be after from" },
    ]);
  }
  const requestedSources = sources.length ? [...new Set(sources)] : [...FEED_SOURCE_IDS];
  await getDb();
  if (options.refresh !== false)
    scheduleStaleRefresh(await staleSources(requestedSources, current));

  const tokens = textFilter(q);
  const filter: QueryFilter<FeedItemDoc> = {
    source: trusted({ $in: requestedSources }),
    kind: trusted({ $in: kinds.length ? [...new Set(kinds)] : [...DEFAULT_EVENT_KINDS] }),
    startsAt: trusted({ $ne: null, $lt: to }),
    $or: [
      { endsAt: trusted({ $gt: from }) },
      { endsAt: null, startsAt: trusted({ $gte: from }) },
      {
        endsAt: null,
        kind: "event",
        startsAt: trusted({ $gt: new Date(from.getTime() - OPEN_ENDED_EVENT_MS) }),
      },
    ],
    ...(tokens.length ? { $and: tokens } : {}),
  };
  const timeZone = readEnv("APP_TIMEZONE");
  // One event listed by several sources is one item (server/feeds/merge.ts), so a page of `limit` events can
  // need more rows than that: read until the first `limit` events are complete (the last row read starts more
  // than MERGE_WINDOW_MS after the last one's first listing) or every match is read.
  let take = limit + 1;
  for (let round = 1; ; round++) {
    const docs = await FeedItem.find(filter, WIRE_PROJECTION)
      .sort({ startsAt: 1, title: 1, source: 1, externalId: 1 })
      .limit(take)
      .lean();
    const groups = groupListings(
      docs.map(toFeedItem).filter((item): item is FeedItemWire => item !== null),
      timeZone,
    );
    const lastRead = docs.at(-1)?.startsAt?.getTime() ?? 0;
    const lastOpened = groups[limit - 1]?.first.startsAt;
    const settled =
      groups.length > limit && !!lastOpened && lastRead - Date.parse(lastOpened) > MERGE_WINDOW_MS;
    if (docs.length < take || settled || round === MAX_MERGE_READS) {
      const items = groups
        .slice(0, limit)
        .map((group) => group.shown)
        .sort(byListOrder);
      return { items, hasMore: groups.length > limit || docs.length === take };
    }
    take *= 2;
  }
}

/** At most this many reads per page (each twice the last): a page of 100 reads at most 808 rows. */
const MAX_MERGE_READS = 4;

/** listEventsPage's order (the query's sort), for the merged page: a shown listing may start a minute later. */
function byListOrder(a: FeedItemWire, b: FeedItemWire): number {
  return (
    Date.parse(a.startsAt!) - Date.parse(b.startsAt!) ||
    (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) ||
    (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** listEventsPage without the "cut at limit" flag (the frozen service surface). */
export async function listEvents(
  query: EventsQueryInput = {},
  options: ReadOptions = {},
): Promise<FeedItemWire[]> {
  return (await listEventsPage(query, options)).items;
}

export const NewsQuerySchema = z.object({
  sources: queryList(FeedSourceIdSchema),
  q: queryText(100),
  limit: queryInt(1, 100, 20),
});
export type NewsQueryInput = z.input<typeof NewsQuerySchema>;

/**
 * The latest news items (WildcatSync news, The Davidsonian, davidson.edu news; plus Events Digest issues that
 * could not be split into events), newest first. Stale sticky items were already skipped at ingest.
 */
export async function listNews(
  query: NewsQueryInput = {},
  options: ReadOptions = {},
): Promise<FeedItemWire[]> {
  const parsed = NewsQuerySchema.safeParse(query);
  if (!parsed.success) invalid(parsed.error);
  const { sources, q, limit } = parsed.data;
  const requestedSources = sources.length ? [...new Set(sources)] : [...FEED_SOURCE_IDS];
  await getDb();
  if (options.refresh !== false) scheduleStaleRefresh(await staleSources(requestedSources));
  const tokens = textFilter(q);
  const docs = await FeedItem.find(
    {
      source: trusted({ $in: requestedSources }),
      kind: "news",
      ...(tokens.length ? { $and: tokens } : {}),
    },
    WIRE_PROJECTION,
  )
    .sort({ startsAt: -1, title: 1, externalId: 1 })
    .limit(limit)
    .lean();
  return docs.map(toFeedItem).filter((item): item is FeedItemWire => item !== null);
}
