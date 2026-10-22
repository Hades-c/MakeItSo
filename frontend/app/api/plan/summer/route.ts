import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { addSummerActivity, listSummerActivities } from "@/server/plan";

/** GET /api/plan/summer → { activities } (by term). */
export const GET = defineRoute(planApi.listSummer, async ({ user }) => ({
  activities: await listSummerActivities(user.id),
}));

/** POST /api/plan/summer → 201 { activity } (a summer term inside the plan's range). */
export const POST = defineRoute(planApi.addSummer, async ({ user, body }) => ({
  activity: await addSummerActivity(user.id, body),
}));
