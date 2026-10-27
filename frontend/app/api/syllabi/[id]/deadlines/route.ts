import { syllabiApi } from "@/lib/api/syllabi";
import { defineRoute } from "@/server/http";
import { ApiError } from "@/server/http/errors";
import { addSyllabusDeadlines } from "@/server/plan";
import { parseDateKey, zonedTimeToUtc } from "@/server/feeds/time";
import { readEnv } from "@/server/env";
import { getSyllabus } from "@/server/syllabi";

/**
 * POST /api/syllabi/[id]/deadlines → 201 { deadlines }. Review-before-save: the body is whatever subset of the
 * syllabus's extracted deadlines the student kept, possibly with edited titles or dates. Each is due at the end
 * of its day (23:59, Davidson time: a syllabus gives a day, not a time) and tagged with the syllabus's own
 * course and this syllabusId, origin "syllabus".
 */
export const POST = defineRoute(syllabiApi.saveDeadlines, async ({ user, params, body }) => {
  const syllabus = await getSyllabus(user.id, params.id);
  if (!syllabus) throw new ApiError(404, "not_found", "That syllabus is not in your uploads.");

  const timeZone = readEnv("APP_TIMEZONE");
  const deadlines = await addSyllabusDeadlines(
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
  return { deadlines };
});
