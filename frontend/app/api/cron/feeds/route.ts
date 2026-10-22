import { eventsApi } from "@/lib/api/events";
import { getFlags } from "@/lib/flags";
import { syncFeeds } from "@/server/feeds";
import { defineRoute } from "@/server/http";

// Six sources in parallel, each with an 8 s upstream timeout (Hurt Hub may add its Tribe fallback).
export const maxDuration = 60;

// GET /api/cron/feeds (Vercel Cron, Authorization: Bearer $CRON_SECRET) → { ok, results } (lib/api/events.ts).
// Refreshes every feed source and records each with recordSync(); `ok` is false when any source failed (the
// failing sources keep their last good items). Nothing to do while FEATURE_EVENTS is off.
export const GET = defineRoute(eventsApi.cronFeeds, async () => {
  if (!getFlags().events) return { ok: true, results: [] };
  const results = await syncFeeds();
  return { ok: results.every((result) => result.ok), results };
});
