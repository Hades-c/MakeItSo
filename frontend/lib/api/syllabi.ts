import * as z from "zod";
import { aiResultSchema } from "@/lib/types/ai";
import { apiRoute } from "@/lib/api/spec";
import { CourseCodeSchema, ObjectIdSchema, TermCodeSchema } from "@/lib/types/common";
import { StudentDeadlineSchema } from "@/lib/types/plan";
import { ExtractedDeadlineSchema, SyllabusSchema } from "@/lib/types/syllabus";
import {
  MAX_SYLLABUS_CHARS,
  MAX_SYLLABUS_DEADLINES,
  MIN_SYLLABUS_CHARS,
  usableChars,
} from "@/lib/syllabus-text";

/**
 * Pasted-syllabus routes (/syllabi, app/api/syllabi/**, PLAN-UX §3). Signed-in users only, never cached.
 *
 * POST /api/syllabi takes the syllabus as pasted text (at most MAX_SYLLABUS_CHARS characters, lib/syllabus-text.ts:
 * the same limit the form counts down) with its course and term. It is an `aiResult` route like the other AI
 * features: a quota, consent or unverified failure is returned as an AiResult rather than thrown, and nothing is
 * stored when it fails.
 */

const IdParams = z.object({ id: ObjectIdSchema });

/** JSON-escaped, 20,000 characters can take up to 6 bytes each (` `), plus the other fields. */
const PASTE_MAX_BYTES = MAX_SYLLABUS_CHARS * 6 + 1_024;

export const PasteSyllabusBodySchema = z
  .object({
    courseCode: CourseCodeSchema,
    termCode: TermCodeSchema,
    text: z
      .string()
      .max(MAX_SYLLABUS_CHARS, {
        error: `Paste at most ${MAX_SYLLABUS_CHARS.toLocaleString("en-US")} characters: the part of the syllabus with the schedule and due dates.`,
      })
      .refine((text) => usableChars(text) >= MIN_SYLLABUS_CHARS, {
        error: "Paste the syllabus text first: there is too little here to find dates in.",
      }),
  })
  .strict();

export const PasteSyllabusResultSchema = aiResultSchema(z.object({ syllabus: SyllabusSchema }));

/** The reviewed (possibly edited, possibly a subset of) deadlines the student chooses to save to their plan. */
export const SaveSyllabusDeadlinesBodySchema = z
  .object({ deadlines: z.array(ExtractedDeadlineSchema).max(MAX_SYLLABUS_DEADLINES) })
  .strict();

export const syllabiApi = {
  list: apiRoute({
    method: "GET",
    path: "/api/syllabi",
    auth: "user",
    response: z.object({ syllabi: z.array(SyllabusSchema) }),
  }),
  paste: apiRoute({
    method: "POST",
    path: "/api/syllabi",
    auth: "user",
    aiResult: true,
    body: PasteSyllabusBodySchema,
    maxBytes: PASTE_MAX_BYTES,
    response: PasteSyllabusResultSchema,
  }),
  remove: apiRoute({
    method: "DELETE",
    path: "/api/syllabi/[id]",
    auth: "user",
    params: IdParams,
    response: null,
  }),
  /**
   * Review-before-save: push the chosen deadlines into the plan, origin "syllabus". Saving the same review again
   * adds nothing twice: `added` counts the new ones, `deadlines` is every chosen one as the plan now holds it.
   */
  saveDeadlines: apiRoute({
    method: "POST",
    path: "/api/syllabi/[id]/deadlines",
    auth: "user",
    params: IdParams,
    body: SaveSyllabusDeadlinesBodySchema,
    response: z.object({
      deadlines: z.array(StudentDeadlineSchema),
      added: z.number().int().min(0),
    }),
    status: 201,
  }),
} as const;
