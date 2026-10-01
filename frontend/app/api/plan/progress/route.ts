import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { getProgress } from "@/server/plan";

/**
 * GET /api/plan/progress → { progress }: credits and requirement slots (unofficial — verify in Degree Works). The
 * progress also carries the engine's disclaimer, catalogYear, rulesExact and alsoTagged (see
 * server/plan/requirements.ts), which the contract does not list yet.
 */
export const GET = defineRoute(planApi.progress, async ({ user }) => {
  const progress = await getProgress(user.id);
  return { progress };
});
