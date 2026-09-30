import { eventsApi } from "@/lib/api/events";
import { getFlags } from "@/lib/flags";
import { FEED_SOURCE_IDS } from "@/lib/types/feeds";
import { now } from "@/server/clock";
import { listEvents } from "@/server/feeds";
import { ApiError, defineRoute } from "@/server/http";
import { getSourceStatuses } from "@/server/sync";

// GET /api/events?from=&to=&sources=&kinds=&q=&limit= → { items, sources } (contract: lib/api/events.ts).
// Signed-in users; Cache-Control: private, no-store. 404 while FEATURE_EVENTS is off.
export const GET = defineRoute(eventsApi.list, async ({ query }) => {
  if (!getFlags().events) throw new ApiError(404, "not_found", "Campus events are turned off.");
  const items = await listEvents(query);
  const requested = query.sources.length ? query.sources : FEED_SOURCE_IDS;
  const statuses = new Map((await getSourceStatuses(now())).map((row) => [row.id, row]));
  const sources = FEED_SOURCE_IDS.filter((id) => requested.includes(id)).map((id) => ({
    id,
    lastSync: statuses.get(id)?.lastSync?.toISOString() ?? null,
  }));
  return { items, sources };
});
