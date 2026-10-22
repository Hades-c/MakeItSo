import { ProfessorSummaryJobResultSchema, runProfessorSummaryJob } from "@/server/ai";
import { defineRoute } from "@/server/http";

// GET /api/cron/ai/professor-summaries (weekly Vercel Cron, Bearer $CRON_SECRET) → ProfessorSummaryJobResult. With
// RMP_SUMMARIES_ENABLED off (the default) it answers { skipped: "disabled" } without reading anything.
export const maxDuration = 120;

export const GET = defineRoute(
  {
    method: "GET",
    path: "/api/cron/ai/professor-summaries",
    auth: "cron",
    response: ProfessorSummaryJobResultSchema,
  },
  () => runProfessorSummaryJob(),
);
