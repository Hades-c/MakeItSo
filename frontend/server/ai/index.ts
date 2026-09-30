import "server-only";

/**
 * AI features on Claude Sonnet 5.5 (owner W6; PLAN §1 "AI", §5 "AI grounding", §6.1 W6, §9 "AI wire format").
 * Import from "@/server/ai".
 *
 *   gate        aiGateInput(userId, feature) → pass to lib/types/ai.ts aiGateFailure (disabled → not_configured
 *               → unverified → consent_required); aiConfigured(); aiFeatureEnabled(flags, feature)
 *   features    generateCourseAbout, generatePlanSuggestions, generateCareerPlan, generateColdEmail (each
 *               returns an AiResult; bad ids or terms throw ApiError 400/404)
 *   jobs        pregenerateCourseAbout (GET /api/cron/ai)
 *   internals   server/ai/client.ts generate() (the only model call), mock.ts (AI_PROVIDER=mock), payloads.ts
 *               (the allow-list), prompts/*.ts (frozen system prompts with PROMPT_VERSION), grounding.ts,
 *               candidates.ts, sanitize.ts, cache.ts, usage.ts (budget + quotas)
 */

export { aiConfigured, aiProvider } from "./provider";
export { aiFeatureEnabled, aiGateInput } from "./gate";
export {
  AI_MODEL,
  AI_REPORT_RATE_LIMIT,
  AI_ROUTE_MAX_DURATION,
  AI_ROUTE_RATE_LIMIT,
  DAILY_GENERATION_QUOTA,
  DAILY_REGENERATION_QUOTA,
} from "./config";
export { generateCourseAbout, type CourseAboutResult } from "./features/course-about";
export { generatePlanSuggestions, type PlanSuggestionsResult } from "./features/plan-suggestions";
export { generateCareerPlan, type CareerPlanResult } from "./features/career-plan";
export { generateColdEmail, type ColdEmailResult } from "./features/cold-email";
export {
  pregenerateCourseAbout,
  PregenerateResultSchema,
  type PregenerateResult,
} from "./pregenerate";
