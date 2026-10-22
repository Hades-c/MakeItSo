import { aiApi } from "@/lib/api/ai";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput, generateCourseAbout } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/course-about { termCode, courseCode } → AiResult<{ about, provenance }> (lib/api/ai.ts). Shared per
// official catalog text; a miss counts against the student's daily generations. 404 when the course is not
// offered in that term. The gate answers disabled / not_configured / unverified / consent_required first.
export const maxDuration = 120;

export const POST = defineRoute(
  { ...aiApi.courseAbout, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ user, body }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "course-about"));
    if (gate) return gate;
    return generateCourseAbout(user.id, body);
  },
);
