import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { addItem } from "@/server/plan";

/**
 * POST /api/plan/items → 201 { item, warnings }. Catalog-validated (title, credits and requirement codes from the
 * listing registered under); a code in no ingested term becomes a manual, unverified entry. 409 when the same
 * (term, course) is already active; the same course in another term is allowed with a warning.
 */
export const POST = defineRoute(planApi.addItem, async ({ user, body }) => addItem(user.id, body));
