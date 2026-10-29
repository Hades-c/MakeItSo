import { syllabiApi } from "@/lib/api/syllabi";
import { defineRoute } from "@/server/http";
import { deleteSyllabus } from "@/server/syllabi";

/** DELETE /api/syllabi/[id] → 204 (a missing id is a no-op). Also removes the plan deadlines it added. */
export const DELETE = defineRoute(syllabiApi.remove, async ({ user, params }) => {
  await deleteSyllabus(user.id, params.id);
  return null;
});
