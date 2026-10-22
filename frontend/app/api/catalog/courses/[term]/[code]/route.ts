import { catalogApi } from "@/lib/api/catalog";
import { termLabel } from "@/lib/term";
import { readCourse } from "@/server/catalog/read";
import { ApiError, defineRoute } from "@/server/http";

// GET /api/catalog/courses/202602/CSC-221 → { course, asOf } (404 when the course is not offered that term).
export const GET = defineRoute(catalogApi.course, async ({ params }) => {
  const found = await readCourse(params.term, params.code);
  if (!found) {
    throw new ApiError(
      404,
      "not_found",
      `${params.code} is not offered in ${termLabel(params.term)}.`,
    );
  }
  return found;
});
