import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { addDeadline, listDeadlines } from "@/server/plan";

/** GET /api/plan/deadlines → { deadlines } (student-entered, by due date). */
export const GET = defineRoute(planApi.listDeadlines, async ({ user }) => ({
  deadlines: await listDeadlines(user.id),
}));

/** POST /api/plan/deadlines → 201 { deadline }. */
export const POST = defineRoute(planApi.addDeadline, async ({ user, body }) => ({
  deadline: await addDeadline(user.id, body),
}));
