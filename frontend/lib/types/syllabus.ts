import * as z from "zod";
import {
  CourseCodeSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  ObjectIdSchema,
  TermCodeSchema,
} from "@/lib/types/common";

/**
 * Syllabus uploads (/syllabi, PLAN-UX §3). The file itself is never stored: a syllabus is read once to extract
 * text, then discarded; what is kept is this record (course code, term, the original filename, when it was
 * uploaded, and the deadlines the AI found) plus whatever of those deadlines the student reviewed and chose to
 * keep in their plan (lib/types/plan.ts StudentDeadline, origin "syllabus", syllabusId pointing back here).
 */

/** One deadline as the AI extracted it (or as the student edited it before saving to their plan). */
export const ExtractedDeadlineSchema = z.object({
  title: z.string().trim().min(1).max(120),
  /** Date only: a syllabus gives a day, rarely a time. Saved to the plan at end of day, Davidson time. */
  dueAt: IsoDateSchema,
});
export type ExtractedDeadline = z.infer<typeof ExtractedDeadlineSchema>;

/** A stored syllabus upload, as the API returns it. */
export const SyllabusSchema = z.object({
  id: ObjectIdSchema,
  courseCode: CourseCodeSchema,
  termCode: TermCodeSchema,
  filename: z.string().min(1).max(200),
  uploadedAt: IsoDateTimeSchema,
  extractedDeadlines: z.array(ExtractedDeadlineSchema),
});
export type Syllabus = z.infer<typeof SyllabusSchema>;
