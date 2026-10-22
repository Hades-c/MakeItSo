import { aiApi } from "@/lib/api/ai";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput, generateColdEmail } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/cold-email { alumnusId, careerSlug?, regenerate } → AiResult<{ email }> (lib/api/ai.ts). Contactable
// verified alumni only (404 otherwise); the body keeps the literal {{studentName}}. "disabled" while the alumni
// section is off.
export const maxDuration = 120;

export const POST = defineRoute(
  { ...aiApi.coldEmail, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ user, body }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "cold-email"));
    if (gate) return gate;
    return generateColdEmail(user.id, body);
  },
);
