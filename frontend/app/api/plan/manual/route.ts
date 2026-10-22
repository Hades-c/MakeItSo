import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { updateManual } from "@/server/plan";

/** PATCH /api/plan/manual → { manual }: language proficiency/exemption and the PE checklist. */
export const PATCH = defineRoute(planApi.updateManual, async ({ user, body }) => ({
  manual: await updateManual(user.id, body),
}));
