import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { removeSummerActivity, updateSummerActivity } from "@/server/plan";

/** PATCH /api/plan/summer/[id] → { activity } ("" clears organization/note; 404 unknown id). */
export const PATCH = defineRoute(planApi.updateSummer, async ({ user, params, body }) => ({
  activity: await updateSummerActivity(user.id, params.id, body),
}));

/** DELETE /api/plan/summer/[id] → 204 (a missing id is a no-op). */
export const DELETE = defineRoute(planApi.removeSummer, async ({ user, params }) => {
  await removeSummerActivity(user.id, params.id);
  return null;
});
