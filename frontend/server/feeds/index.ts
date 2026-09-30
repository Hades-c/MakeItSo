import "server-only";
import type { EventsQueryInput, FeedItem, FeedSyncResult, LibraryHours } from "@/lib/types/feeds";
import { notImplemented } from "@/server/http/errors";

/**
 * Campus feeds service (PLAN §4.1.5; owner W4a). FROZEN signatures: W4a replaces the bodies; until then every
 * function throws ApiError(501, "unavailable", "... is not implemented yet.").
 *
 * Sources and URLs: content-prep/links.json → feeds (WildcatSync events.ics + news.rss, Hurt Hub ICS + Tribe JSON
 * fallback, LibCal hours JSON + events ICS, thedavidsonian.news/feed, Events Digest RSS, davidson.edu/rss.xml),
 * fetched only with fetchExternal and cached 30–60 min in `feeditems`; every run calls recordSync().
 */

/** Stored feed items in [from, to) (default now → +14 days), filtered by source/kind/text, soonest first. */
export async function listEvents(_query: EventsQueryInput = {}): Promise<FeedItem[]> {
  throw notImplemented("listEvents");
}

/** LibCal hours for an America/New_York date ("YYYY-MM-DD"). */
export async function getLibraryHours(_date: string): Promise<LibraryHours> {
  throw notImplemented("getLibraryHours");
}

/** Refresh every feed (cron); one result per source, failures isolated per source. */
export async function syncFeeds(): Promise<FeedSyncResult[]> {
  throw notImplemented("syncFeeds");
}
