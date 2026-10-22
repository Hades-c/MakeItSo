import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { removeItem, updateItem } from "@/server/plan";

/** PATCH /api/plan/items/[id] → { item, warnings }: whitelisted fields only (404 unknown id, 409 duplicate). */
export const PATCH = defineRoute(planApi.updateItem, async ({ user, params, body }) =>
  updateItem(user.id, params.id, body),
);

/** DELETE /api/plan/items/[id] → 204 (removing a missing id is a no-op). */
export const DELETE = defineRoute(planApi.removeItem, async ({ user, params }) => {
  await removeItem(user.id, params.id);
  return null;
});
