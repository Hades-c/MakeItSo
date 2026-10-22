import { ratingsApi } from "@/lib/api/ratings";
import { defineRoute } from "@/server/http";
import { syncRoster } from "@/server/rmp";

// GET /api/cron/rmp (weekly Vercel Cron, Authorization: Bearer $CRON_SECRET) → RosterSyncResult. A failed run
// answers 200 with ok: false and keeps the stored roster; the Sources panel shows the failure (recordSync).
export const maxDuration = 60;

export const GET = defineRoute(ratingsApi.cronRoster, () => syncRoster());
