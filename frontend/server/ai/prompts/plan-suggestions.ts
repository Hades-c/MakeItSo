import "server-only";
import * as z from "zod";
import { dataBlock, DATA_RULES } from "@/server/ai/blocks";
import type { GenerateRequest } from "@/server/ai/client";
import { FEATURE_SETTINGS } from "@/server/ai/config";
import type { PlanItemPayload, RequirementRef, StudentProfilePayload } from "@/server/ai/payloads";

/**
 * Plan suggestions (personal; effort high): retrieve-then-rank. The server retrieves the candidates (catalog
 * courses in the target term, or past offerings for an unpublished term, that fill the student's open requirement
 * slots and are not completed or planned, with restriction flags); the model only picks and explains. Every
 * returned code is validated against the candidates (server/ai/grounding.ts).
 */
export const PROMPT_VERSION = "plan-suggestions/1";

/** What the model returns (mapped onto PlanDraft items; `why` → reason). */
export const OutputSchema = z.object({
  picks: z.array(
    z.object({
      courseCode: z.string().describe("The exact courseCode of one candidate"),
      termCode: z.string().describe("The target term code"),
      why: z.string().describe("One short sentence, at most 25 words"),
    }),
  ),
});
export type PlanSuggestionsOutput = z.infer<typeof OutputSchema>;

export const MAX_PICKS = 5;

export const SYSTEM = [
  "You help a Davidson College student choose courses for one upcoming term in MakeItSo, an independent planner. MakeItSo is not an official Davidson service: students confirm every choice with their advisor and in Degree Works.",
  [
    "You receive:",
    '- <catalog_data>: today\'s date, the current and registration terms, the target term, and the candidate courses. A candidate with basis "scheduled" has sections in the target term; basis "past-offerings" means the target term is not scheduled yet and the course ran in recent terms (listed in "ranIn"). "fills" lists the open general-education requirements the course would count toward for this student, and "flags" lists registration restrictions that may apply to them.',
    "- <student_profile>: majors, minors, graduation year, class standing and career interests (career-path slugs).",
    "- <student_plan>: the student's completed, current and planned courses, and the requirements still open.",
  ].join("\n"),
  [
    `Pick up to ${MAX_PICKS} candidates that make a sensible set for the target term. Prefer courses that fill open requirements, spread the picks over different requirements, fit the student's majors, minors and interests, and avoid flagged candidates unless nothing else fits.`,
    "Pick only from the candidates, using each candidate's exact courseCode and the target term code. Never pick a course that is not a candidate.",
    'For each pick write "why": one short sentence (at most 25 words) naming the requirement or interest it serves. Do not restate course descriptions.',
  ].join("\n"),
  DATA_RULES,
].join("\n\n");

export const TASK =
  "Pick the courses for the target term in <catalog_data> for the student in <student_profile> and <student_plan>.";

export interface PlanCandidatePayload {
  courseCode: string;
  title: string;
  basis: "scheduled" | "past-offerings";
  ranIn?: string[];
  fills: string[];
  flags: string[];
}

export interface PlanSuggestionsData {
  catalog: {
    today: string;
    currentTerm: string;
    registrationTerm: string;
    targetTerm: { code: string; label: string; scheduled: boolean };
    candidates: PlanCandidatePayload[];
  };
  profile: StudentProfilePayload;
  plan: { items: PlanItemPayload[]; openRequirements: RequirementRef[] };
}

export function planSuggestionsRequest(data: PlanSuggestionsData): GenerateRequest {
  return {
    feature: "plan-suggestions",
    system: SYSTEM,
    userBlocks: [
      dataBlock("catalog_data", data.catalog),
      dataBlock("student_profile", data.profile),
      dataBlock("student_plan", data.plan),
      TASK,
    ],
    ...FEATURE_SETTINGS["plan-suggestions"],
  };
}
