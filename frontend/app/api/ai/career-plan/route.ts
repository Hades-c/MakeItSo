import { aiApi } from "@/lib/api/ai";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput, generateCareerPlan } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/career-plan { careerSlug, regenerate } → AiResult<{ plan, draft }> (lib/api/ai.ts). "disabled" while
// the careers section is off; 404 for an unknown career path.
export const maxDuration = 120;

export const POST = defineRoute(
  { ...aiApi.careerPlan, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ user, body }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "career-plan"));
    if (gate) return gate;
    return generateCareerPlan(user.id, body);
  },
);
