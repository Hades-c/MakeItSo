import { ratingsApi } from "@/lib/api/ratings";
import { defineRoute } from "@/server/http";
import { runRmpCron } from "@/server/rmp/cron";

// GET /api/cron/rmp (daily Vercel Cron, Authorization: Bearer $CRON_SECRET) → { roster, tags } (RmpCronResult):
// the weekly roster sync when it is due, then RateMyProfessors tag counts until the job's 240 s budget runs out.
// A failed step answers 200 with ok: false and keeps the stored data; the roster's state shows in the Sources
// panel (recordSync), the tag runs' in rmptagsyncs.
export const maxDuration = 300;

export const GET = defineRoute(ratingsApi.cronRoster, () => runRmpCron());
