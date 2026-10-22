import { pregenerateCourseAbout, PregenerateResultSchema } from "@/server/ai";
import { defineRoute } from "@/server/http";

// GET /api/cron/ai (Vercel Cron, Authorization: Bearer $CRON_SECRET) → PregenerateResult: fills the shared
// course-about entries of the registration term, within a time budget and AI_DAILY_TOKEN_BUDGET; each run
// continues where the last stopped. Does nothing while AI is off or not configured.
export const maxDuration = 120;

export const GET = defineRoute(
  { method: "GET", path: "/api/cron/ai", auth: "cron", response: PregenerateResultSchema },
  () => pregenerateCourseAbout(),
);
