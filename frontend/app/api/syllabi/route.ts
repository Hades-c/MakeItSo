import { syllabiApi } from "@/lib/api/syllabi";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput } from "@/server/ai";
import { defineRoute } from "@/server/http";
import { addSyllabus, listSyllabi } from "@/server/syllabi";

// GET /api/syllabi → { syllabi } (newest first).
export const GET = defineRoute(syllabiApi.list, async ({ user }) => ({
  syllabi: await listSyllabi(user.id),
}));

/**
 * POST /api/syllabi { courseCode, termCode, text } → AiResult<{ syllabus }>. The pasted text (lib/syllabus-text.ts
 * limits, checked by the body schema) goes to the AI extraction once and is never stored or logged; the same
 * gate-then-generate shape as the other AI routes.
 */
export const maxDuration = 120;

export const POST = defineRoute(
  { ...syllabiApi.paste, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ user, body }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "syllabus-deadlines"));
    if (gate) return gate;
    return addSyllabus(user.id, body);
  },
);
