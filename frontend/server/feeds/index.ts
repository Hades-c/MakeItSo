import "server-only";

/**
 * Campus feeds service (PLAN §4.1.5, §6.1 W4a). FROZEN surface:
 *
 *   listEvents({ from, to, sources, kinds, q, limit })  stored items overlapping [from, to) (default now → +14 d),
 *                                                       events + deadlines unless `kinds` says otherwise, soonest
 *                                                       first; an event without an end (Events Digest) counts as
 *                                                       lasting 2 h for the overlap
 *   listNews({ sources, q, limit })                     latest news, newest first (stale sticky items skipped)
 *   getLibraryHours(date)                               LibCal hours for an America/New_York date
 *   syncFeeds({ sources?, onlyStale? })                 refresh feeds (cron); one FeedSyncResult per source run,
 *                                                       failures isolated per source, each recorded with
 *                                                       recordSync()
 *
 * Sources (content-prep links → feeds; config in ./config.ts): WildcatSync events.ics + news.rss, Hurt Hub iCal
 * (+ Tribe REST fallback), LibCal hours JSON + events iCal, thedavidsonian.news/feed (never davidsonian.com), the
 * Events Digest (Mailchimp archive RSS) and www.davidson.edu/rss.xml, all through fetchExternal. Items are text
 * only with https links on per-source allow-listed hosts, stored in `feeditems` (upsert by source + externalId,
 * TTL 60 days after the end). Reads never block on an upstream; stale sources (30–60 min) refresh in the
 * background with after(). The one exception: getLibraryHours(today) with nothing stored waits up to 5 s for a
 * due library sync (at most one per 30 min). A failing source keeps its last good items; a feed that parses but
 * yields no readable entries counts as failing.
 */
export { getLibraryHours, listEvents, listNews } from "./query";
export { syncFeeds } from "./sync";
