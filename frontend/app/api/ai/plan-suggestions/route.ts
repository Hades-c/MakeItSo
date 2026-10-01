import { aiApi } from "@/lib/api/ai";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput, generatePlanSuggestions } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/plan-suggestions { termCode?, regenerate } → AiResult<{ draft }> (lib/api/ai.ts). Retrieve-then-rank
// over catalog candidates for the target term (default: the registration term), stored as a PlanDraft; personal,
// cached 30 days; `regenerate` counts against 3 regenerations a day.
export const maxDuration = 120;

export const POST = defineRoute(
  { ...aiApi.planSuggestions, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ user, body }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "plan-suggestions"));
    if (gate) return gate;
    return generatePlanSuggestions(user.id, body);
  },
);
