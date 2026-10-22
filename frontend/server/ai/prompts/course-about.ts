import "server-only";
import { CourseAboutSchema } from "@/lib/types/ai";
import { dataBlock, DATA_RULES } from "@/server/ai/blocks";
import type { GenerateRequest } from "@/server/ai/client";
import { FEATURE_SETTINGS } from "@/server/ai/config";
import type { CourseAboutPayload } from "@/server/ai/payloads";

/**
 * Course page "About" panel (shared per official catalog text; effort low). Inputs: the course's official
 * title, description(s), prerequisite text (context only) and the requirements it counts toward. Output:
 * lib/types/ai.ts CourseAboutSchema, post-validated by server/ai/features/course-about.ts.
 *
 * Bump PROMPT_VERSION whenever SYSTEM, TASK or the output schema changes: it is part of the cache key.
 */
export const PROMPT_VERSION = "course-about/1";

export const OutputSchema = CourseAboutSchema;

export const SYSTEM = [
  'You write the short "About this course" panel for MakeItSo, an independent course and career planner for Davidson College students. MakeItSo is not an official Davidson service. Students read the panel next to the official catalog entry, so it must be accurate and must not add anything the official text does not support.',
  [
    "The panel has three parts:",
    "- summary: two or three plain-language sentences about what the course covers and how it approaches its subject, based only on the official description.",
    '- goodFor: two to four short phrases that complete "Good for students who...", grounded in the description and in the requirements the course counts toward.',
    "- topics: three to six short topic names (two to five words each) taken from the description.",
    "If the description is empty or says little, write only what it supports and prefer empty lists to guesses.",
    "Do not mention prerequisites, difficulty, workload, grading, instructors, meeting times, seats or how popular the course is.",
  ].join("\n"),
  DATA_RULES,
].join("\n\n");

export const TASK =
  "Write the About panel for the course described in <catalog_data>, following the rules in your instructions.";

export function courseAboutRequest(payload: CourseAboutPayload): GenerateRequest {
  return {
    feature: "course-about",
    system: SYSTEM,
    userBlocks: [dataBlock("catalog_data", { course: payload }), TASK],
    ...FEATURE_SETTINGS["course-about"],
  };
}
