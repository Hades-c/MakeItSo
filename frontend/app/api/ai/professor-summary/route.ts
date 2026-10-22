import { aiApi } from "@/lib/api/ai";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput, readProfessorSummary } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/professor-summary { termCode, courseCode, instructor } → AiResult<{ summary, provenance }>
// (lib/api/ai.ts). "disabled" unless RMP_SUMMARIES_ENABLED (default off), before anything else runs. Reads the
// weekly job's entry only: this route never generates.
export const maxDuration = 120;

export const POST = defineRoute(
  { ...aiApi.professorSummary, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ user, body }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "professor-summary"));
    if (gate) return gate;
    return readProfessorSummary(user.id, body);
  },
);
