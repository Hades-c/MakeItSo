import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import { IsoDateSchema, IsoDateTimeSchema } from "@/lib/types/common";
import {
  EventsQuerySchema,
  FeedItemSchema,
  FeedSourceIdSchema,
  FeedSyncResultSchema,
  LibraryHoursSchema,
} from "@/lib/types/feeds";

/**
 * Events and feeds (W4a: app/api/events/**, app/api/cron/feeds/**). Signed-in users; the cron route refreshes
 * every feed (30–60 min cache) and records each source with recordSync().
 */

export const EventsResponseSchema = z.object({
  items: z.array(FeedItemSchema),
  /** Last successful sync per feed source, for the tags' "as of" and the Sources panel. */
  sources: z.array(z.object({ id: FeedSourceIdSchema, lastSync: IsoDateTimeSchema.nullable() })),
});

export const CronResponseSchema = z.object({
  ok: z.boolean(),
  results: z.array(FeedSyncResultSchema),
});

export const eventsApi = {
  /** GET /api/events?from=&to=&sources=&kinds=&q=&limit= */
  list: apiRoute({
    method: "GET",
    path: "/api/events",
    auth: "user",
    query: EventsQuerySchema,
    response: EventsResponseSchema,
  }),
  /** GET /api/events/library-hours?date=YYYY-MM-DD (America/New_York; default today). */
  libraryHours: apiRoute({
    method: "GET",
    path: "/api/events/library-hours",
    auth: "user",
    query: z.object({ date: IsoDateSchema.optional() }),
    response: z.object({ hours: LibraryHoursSchema }),
  }),
  /** GET /api/cron/feeds (Vercel Cron, Bearer CRON_SECRET). */
  cronFeeds: apiRoute({
    method: "GET",
    path: "/api/cron/feeds",
    auth: "cron",
    response: CronResponseSchema,
  }),
} as const;
