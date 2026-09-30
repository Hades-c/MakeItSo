import { programsApi } from "@/lib/api/programs";
import { defineRoute } from "@/server/http";
import { syncPrograms } from "@/server/programs";

// The sync reads the program list and at most a few changed program pages (8 s timeout each, 40 s budget).
export const maxDuration = 60;

// GET /api/cron/programs (weekly Vercel Cron, Authorization: Bearer $CRON_SECRET) → { ok, count, error?, pages? }
// (programsApi.cron). 200 even when the upstream failed: the run itself is recorded with recordSync.
export const GET = defineRoute(programsApi.cron, async () => syncPrograms());
