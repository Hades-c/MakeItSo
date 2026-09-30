import { eventsApi } from "@/lib/api/events";
import { dayKey } from "@/lib/format";
import { getFlags } from "@/lib/flags";
import { now } from "@/server/clock";
import { readEnv } from "@/server/env";
import { getLibraryHours } from "@/server/feeds";
import { ApiError, defineRoute } from "@/server/http";

// GET /api/events/library-hours?date=YYYY-MM-DD (America/New_York; default today) → { hours }
// (contract: lib/api/events.ts). 404 for a date without hours, 503 when LibCal is down and nothing is stored.
export const GET = defineRoute(eventsApi.libraryHours, async ({ query }) => {
  if (!getFlags().events) throw new ApiError(404, "not_found", "Campus events are turned off.");
  const date = query.date ?? dayKey(now(), readEnv("APP_TIMEZONE"));
  return { hours: await getLibraryHours(date) };
});
