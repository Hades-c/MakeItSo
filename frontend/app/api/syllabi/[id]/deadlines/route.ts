import { syllabiApi } from "@/lib/api/syllabi";
import { defineRoute } from "@/server/http";
import { ApiError } from "@/server/http/errors";
import { addSyllabusDeadlines } from "@/server/plan";
import { parseDateKey, zonedTimeToUtc } from "@/server/feeds/time";
import { readEnv } from "@/server/env";
import { getSyllabus } from "@/server/syllabi";

/**
 * POST /api/syllabi/[id]/deadlines → 201 { deadlines, added }. Review-before-save: the body is whatever subset of
 * the syllabus's extracted deadlines the student kept, possibly with edited titles or dates. A syllabus gives a
 * day, not a time: each is stored at the end of its day (23:59, Davidson time, for ordering) and read back as
 * `allDay` (shown as the day alone), tagged with the syllabus's own course and this syllabusId, origin
 * "syllabus". Saving the same review twice adds nothing the second time.
 */
export const POST = defineRoute(syllabiApi.saveDeadlines, async ({ user, params, body }) => {
  const syllabus = await getSyllabus(user.id, params.id);
  if (!syllabus)
    throw new ApiError(404, "not_found", "That syllabus is not in your list any more.");

  const timeZone = readEnv("APP_TIMEZONE");
  return addSyllabusDeadlines(
    user.id,
    params.id,
    body.deadlines.map((deadline) => ({
      title: deadline.title,
      dueAt: zonedTimeToUtc(
        { ...parseDateKey(deadline.dueAt), hour: 23, minute: 59 },
        timeZone,
      ).toISOString(),
      courseCode: syllabus.courseCode,
    })),
  );
});
