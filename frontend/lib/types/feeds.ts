import * as z from "zod";
import {
  HttpsUrlSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  queryInt,
  queryList,
  queryText,
  SyncedSourceIdSchema,
} from "@/lib/types/common";

/**
 * Campus feeds (PLAN §4.1.5), normalised by server/feeds (W4a) from WildcatSync, Hurt Hub, LibCal, The Davidsonian,
 * the Events Digest and davidson.edu news. Text only (feed HTML becomes text), https-only URLs on allow-listed
 * hosts. ICS `Z` times → absolute instants; `VALUE=DATE` = all-day; events ≤ 1 minute render as deadlines.
 */

/** Only feed sources carry FeedItems. */
export const FEED_SOURCE_IDS = [
  "wildcatsync",
  "hurt-hub",
  "library",
  "davidsonian",
  "events-digest",
  "davidson-news",
] as const;
export const FeedSourceIdSchema = z.enum(FEED_SOURCE_IDS);
export type FeedSourceId = z.infer<typeof FeedSourceIdSchema>;

export const FeedKindSchema = z.enum(["event", "news", "deadline", "hours"]);
export type FeedKind = z.infer<typeof FeedKindSchema>;

/**
 * One normalised feed entry.
 * - id: stable per source (hash of source + upstream UID/guid).
 * - startsAt / endsAt: absolute instants; null for news without a date. For all-day items startsAt is midnight
 *   America/New_York of the first day and endsAt midnight after the last day.
 * - summaryText: plain text (≤ 500 chars), never HTML.
 */
export const FeedItemSchema = z.object({
  id: z.string().min(1).max(128),
  source: FeedSourceIdSchema,
  kind: FeedKindSchema,
  title: z.string().min(1).max(300),
  url: HttpsUrlSchema,
  startsAt: IsoDateTimeSchema.nullable(),
  endsAt: IsoDateTimeSchema.nullable(),
  allDay: z.boolean(),
  location: z.string().max(200).nullable(),
  summaryText: z.string().max(500).nullable(),
  fetchedAt: IsoDateTimeSchema,
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

/** `listEvents()` input; also the GET /api/events query. `from`/`to` default to now → now + 14 days. */
export const EventsQuerySchema = z.object({
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
  sources: queryList(FeedSourceIdSchema),
  kinds: queryList(FeedKindSchema),
  q: queryText(100),
  limit: queryInt(1, 500, 100),
});
export type EventsQuery = z.output<typeof EventsQuerySchema>;
export type EventsQueryInput = z.input<typeof EventsQuerySchema>;

/** LibCal "hours today" for one location. `status` mirrors LibCal: open (times), 24hours, text, not-set, closed. */
export const LibraryLocationHoursSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["open", "closed", "24hours", "text", "not-set"]),
  /** LibCal's rendered text ("8am – 2am", "Closed for Renovation"); "" when not set. */
  text: z.string(),
  opensAt: IsoDateTimeSchema.nullable(),
  closesAt: IsoDateTimeSchema.nullable(),
});
export type LibraryLocationHours = z.infer<typeof LibraryLocationHoursSchema>;

export const LibraryHoursSchema = z.object({
  /** Calendar date in America/New_York. */
  date: IsoDateSchema,
  locations: z.array(LibraryLocationHoursSchema),
  fetchedAt: IsoDateTimeSchema,
});
export type LibraryHours = z.infer<typeof LibraryHoursSchema>;

/** Per-source outcome of `syncFeeds()` (also recorded with `recordSync`). */
export const FeedSyncResultSchema = z.object({
  source: SyncedSourceIdSchema,
  ok: z.boolean(),
  count: z.number().int().min(0),
  error: z.string().optional(),
});
export type FeedSyncResult = z.infer<typeof FeedSyncResultSchema>;
