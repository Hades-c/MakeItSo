import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { getPlan } from "@/server/plan";

/** GET /api/plan → the whole plan (v2, or the in-memory conversion of a legacy v1 plan; never cached). */
export const GET = defineRoute(planApi.getPlan, async ({ user }) => ({
  plan: await getPlan(user.id),
}));
