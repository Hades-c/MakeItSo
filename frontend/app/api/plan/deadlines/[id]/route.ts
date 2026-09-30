import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { removeDeadline } from "@/server/plan";

/** DELETE /api/plan/deadlines/[id] → 204 (a missing id is a no-op). */
export const DELETE = defineRoute(planApi.removeDeadline, async ({ user, params }) => {
  await removeDeadline(user.id, params.id);
  return null;
});
