import { aiApi } from "@/lib/api/ai";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput, generateCareerSummers } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/career-summers { careerSlug, regenerate } → AiResult<{ summers }> (lib/api/ai.ts). "disabled" while
// the careers section is off; 404 for an unknown career path.
export const maxDuration = 120;

export const POST = defineRoute(
  { ...aiApi.careerSummers, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ user, body }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "career-summers"));
    if (gate) return gate;
    return generateCareerSummers(user.id, body);
  },
);
