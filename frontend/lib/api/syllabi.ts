import * as z from "zod";
import { aiResultSchema } from "@/lib/types/ai";
import { apiRoute } from "@/lib/api/spec";
import { ObjectIdSchema } from "@/lib/types/common";
import { StudentDeadlineSchema } from "@/lib/types/plan";
import { ExtractedDeadlineSchema, SyllabusSchema } from "@/lib/types/syllabus";

/**
 * Syllabus upload routes (/syllabi, app/api/syllabi/**, PLAN-UX §3). Signed-in users only, never cached.
 *
 * POST /api/syllabi takes `multipart/form-data` (file, courseCode, termCode), not JSON, so it has no `body`
 * schema here — defineRoute's JSON body parsing only applies when a route declares one; the handler reads
 * `request.formData()` itself. It is an `aiResult` route like the other AI features: a quota, consent or
 * unverified failure is returned as an AiResult rather than thrown, and nothing is stored when it fails.
 */

const IdParams = z.object({ id: ObjectIdSchema });

export const UploadSyllabusResultSchema = aiResultSchema(z.object({ syllabus: SyllabusSchema }));

/** The reviewed (possibly edited, possibly a subset of) deadlines the student chooses to save to their plan. */
export const SaveSyllabusDeadlinesBodySchema = z
  .object({ deadlines: z.array(ExtractedDeadlineSchema).max(50) })
  .strict();

export const syllabiApi = {
  list: apiRoute({
    method: "GET",
    path: "/api/syllabi",
    auth: "user",
    response: z.object({ syllabi: z.array(SyllabusSchema) }),
  }),
  upload: apiRoute({
    method: "POST",
    path: "/api/syllabi",
    auth: "user",
    aiResult: true,
    response: UploadSyllabusResultSchema,
  }),
  remove: apiRoute({
    method: "DELETE",
    path: "/api/syllabi/[id]",
    auth: "user",
    params: IdParams,
    response: null,
  }),
  /** Review-before-save: push the chosen deadlines into the plan, origin "syllabus". */
  saveDeadlines: apiRoute({
    method: "POST",
    path: "/api/syllabi/[id]/deadlines",
    auth: "user",
    params: IdParams,
    body: SaveSyllabusDeadlinesBodySchema,
    response: z.object({ deadlines: z.array(StudentDeadlineSchema) }),
    status: 201,
  }),
} as const;
