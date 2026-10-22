import "server-only";
import { after } from "next/server";
import * as z from "zod";
import { IsoDateSchema, queryInt, queryList, queryText } from "@/lib/types/common";
import {
  EventsQuerySchema,
  FEED_SOURCE_IDS,
  FeedSourceIdSchema,
  type EventsQueryInput,
  type FeedItem as FeedItemWire,
  type FeedKind,
  type FeedSourceId,
  type LibraryHours,
  type LibraryLocationHours,
} from "@/lib/types/feeds";
import FeedItem from "@/models/FeedItem";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { readEnv } from "@/server/env";
import { FEED_SOURCES } from "@/server/feeds/config";
import { toFeedItem, WIRE_PROJECTION } from "@/server/feeds/store";
import { staleSources, syncFeeds } from "@/server/feeds/sync";
import { escapeRegExp, foldForSearch } from "@/server/feeds/text";
import { dateKeyInZone, DAY_MS, HOUR_MS } from "@/server/feeds/time";
import { ApiError, zodIssues } from "@/server/http/errors";

/**
 * Read side of the feeds service. Reads never wait for an upstream: they serve what `feeditems` holds and, when a
 * requested source is older than its freshness window (30–60 min), schedule a background refresh with next/server
 * `after()` (stale-while-revalidate; a no-op outside a request, e.g. in tests and scripts). The one exception is
 * getLibraryHours(today) with nothing stored for today and a library sync due (not attempted in the last 30 min):
 * it runs that sync (single-flight, recorded with recordSync) and waits for it up to 5 s.
 */

/** Kinds listEvents returns when `kinds` is empty: events and deadlines (news and hours only when asked). */
export const DEFAULT_EVENT_KINDS: readonly FeedKind[] = ["event", "deadline"];
export const DEFAULT_EVENTS_WINDOW_DAYS = 14;
/**
 * An event without an end time (the Events Digest gives none) counts as running this long for window overlap, so
 * it does not drop out of listEvents the moment it starts. Its endsAt stays null (nothing invented for display).
 */
export const OPEN_ENDED_EVENT_MS = 2 * HOUR_MS;
/** How long getLibraryHours(today) waits for a due library sync when nothing is stored for today. */
export const INLINE_HOURS_WAIT_MS = 5_000;

export interface ReadOptions {
  /** Schedule a background refresh of stale sources (default true). */
  refresh?: boolean;
}

/** Keep `work` alive after the response is sent (serverless). Outside a Next.js request scope this does nothing. */
function keepAlive(work: Promise<unknown>): void {
  try {
    after(() => work.then(noop, noop));
  } catch {
    // Not inside a request: the promise simply runs to completion.
  }
}

function noop(): void {}

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
 * start time (undated news) never match a window.
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
  const docs = await FeedItem.find(
    {
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
    },
    WIRE_PROJECTION,
  )
    .sort({ startsAt: 1, title: 1, source: 1, externalId: 1 })
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const items = docs
    .slice(0, limit)
    .map(toFeedItem)
    .filter((item): item is FeedItemWire => item !== null);
  return { items, hasMore };
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

function hoursFromDocs(
  date: string,
  docs: ReadonlyArray<{
    title: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
    fetchedAt: Date;
    hours?: {
      locationId: string;
      status: string;
      text?: string | null;
      order?: number | null;
    } | null;
  }>,
): LibraryHours | null {
  const rows = docs.filter((doc) => doc.hours);
  if (rows.length === 0) return null;
  rows.sort((a, b) => (a.hours!.order ?? 0) - (b.hours!.order ?? 0));
  const locations: LibraryLocationHours[] = rows.map((doc) => {
    const hours = doc.hours!;
    const status = hours.status as LibraryLocationHours["status"];
    const timed = status === "open" || status === "24hours";
    return {
      id: hours.locationId,
      name: doc.title,
      status,
      text: hours.text ?? "",
      opensAt: timed && doc.startsAt ? doc.startsAt.toISOString() : null,
      closesAt: timed && doc.endsAt ? doc.endsAt.toISOString() : null,
    };
  });
  const fetchedAt = new Date(Math.max(...rows.map((doc) => doc.fetchedAt.getTime())));
  return { date, locations, fetchedAt: fetchedAt.toISOString() };
}

async function storedHours(date: string): Promise<LibraryHours | null> {
  const docs = await FeedItem.find(
    { source: "library", kind: "hours", "hours.date": date },
    { title: 1, startsAt: 1, endsAt: 1, fetchedAt: 1, hours: 1 },
  ).lean();
  return hoursFromDocs(date, docs);
}

/** Resolves when `work` settles or after `ms`, whichever comes first (rejections of `work` propagate). */
async function waitAtMost(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([work.then(noop), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * LibCal opening hours for an America/New_York date ("YYYY-MM-DD"). LibCal only publishes "today", so:
 *   - any date with a stored snapshot → that snapshot (a stale "today" also schedules a background refresh);
 *   - today with nothing stored and the library due for a sync (last attempt ≥ 30 min ago) → that sync runs
 *     (single-flight, recordSync, the feed byte cap) and is awaited up to 5 s; still nothing → 503 unavailable;
 *   - today with nothing stored and a recent attempt (LibCal down, or its "today" was another date around
 *     midnight) → 503 at once, without calling LibCal again until the next window;
 *   - another date with nothing stored → 404 not_found.
 * `refresh: false` never calls an upstream (503 when nothing is stored for today).
 */
export async function getLibraryHours(
  date: string,
  options: ReadOptions = {},
): Promise<LibraryHours> {
  const parsedDate = IsoDateSchema.safeParse(date);
  if (!parsedDate.success) invalid(parsedDate.error);
  const at = now();
  const timeZone = readEnv("APP_TIMEZONE");
  const today = dateKeyInZone(at, timeZone);
  await getDb();

  const stored = await storedHours(parsedDate.data);
  if (stored) {
    const age = at.getTime() - new Date(stored.fetchedAt).getTime();
    if (
      options.refresh !== false &&
      parsedDate.data === today &&
      age >= FEED_SOURCES.library.freshnessMs
    ) {
      scheduleStaleRefresh(await staleSources(["library"], at));
    }
    return stored;
  }
  if (parsedDate.data !== today) {
    throw new ApiError(404, "not_found", `Library hours for ${parsedDate.data} are not available.`);
  }
  if (options.refresh !== false && (await staleSources(["library"], at)).length > 0) {
    const sync = syncFeeds({ sources: ["library"], onlyStale: true });
    keepAlive(sync);
    await waitAtMost(sync, INLINE_HOURS_WAIT_MS);
    const fresh = await storedHours(today);
    if (fresh) return fresh;
  }
  throw new ApiError(503, "unavailable", "Library hours are unavailable right now.");
}
