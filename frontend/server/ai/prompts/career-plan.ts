import "server-only";
import * as z from "zod";
import { dataBlock, DATA_RULES } from "@/server/ai/blocks";
import type { GenerateRequest } from "@/server/ai/client";
import { FEATURE_SETTINGS } from "@/server/ai/config";
import type { CareerPayload, PlanItemPayload, StudentProfilePayload } from "@/server/ai/payloads";

/**
 * Career plan (personal; effort high): the curated career path (server/content/careers), the official Acalog
 * major and minor names (server/programs) and real catalog candidates with the upcoming terms each can be taken
 * in. Majors and minors are checked against the official names and courses against the candidates
 * (server/ai/grounding.ts); the courses become a PlanDraft.
 */
export const PROMPT_VERSION = "career-plan/1";

export const OutputSchema = z.object({
  overview: z.string().describe("Two to four sentences"),
  majors: z.array(z.string().describe("An exact official major name from <catalog_data>")),
  minors: z.array(z.string().describe("An exact official minor name from <catalog_data>")),
  courses: z.array(
    z.object({
      courseCode: z.string().describe("The exact courseCode of one candidate"),
      termCode: z.string().describe("One of that candidate's term codes"),
      why: z.string().describe("One short sentence, at most 25 words"),
    }),
  ),
  experiences: z.array(
    z.object({
      title: z.string().describe("A kind of experience, at most 8 words"),
      when: z.string().describe('A term or class year, e.g. "Summer after sophomore year"'),
      why: z.string().describe("One short sentence, at most 25 words"),
    }),
  ),
});
export type CareerPlanOutput = z.infer<typeof OutputSchema>;

export const MAX_COURSES = 6;
export const MAX_PROGRAMS = 2;
export const MAX_EXPERIENCES = 4;

export const SYSTEM = [
  "You draft a career-oriented academic plan for a Davidson College student in MakeItSo, an independent planner. MakeItSo is not an official Davidson service: students confirm every choice with their advisor, the Center for Career Development and Degree Works.",
  [
    "You receive:",
    '- <catalog_data>: today\'s date, the upcoming terms, the career path (a curated summary, what people in it do, related departments and programs, and Davidson resources), the official major and minor names, and candidate courses with the upcoming terms each can be taken in. A term with basis "past-offerings" is not scheduled yet: the course ran in recent terms.',
    "- <student_profile>: majors, minors, graduation year, class standing and career interests.",
    "- <student_plan>: the student's completed, current and planned courses.",
    "- <student_goals>: the career path the student chose.",
  ].join("\n"),
  [
    "Write:",
    "- overview: two to four sentences on how the student's Davidson studies can build toward this career.",
    `- majors and minors: at most ${MAX_PROGRAMS} each, copied exactly from the official names in <catalog_data>, and only when they fit the career; use empty lists when the student's current programs already fit.`,
    `- courses: at most ${MAX_COURSES} candidates, each with one of its listed term codes, spread over the upcoming terms, and a short "why" (at most 25 words). Pick only from the candidates.`,
    `- experiences: at most ${MAX_EXPERIENCES} kinds of experience (for example research with faculty, an internship, a campus organization, advising appointments), each with "when" and a short "why". Name an organization only if it appears in <catalog_data> as a Davidson resource; otherwise describe the kind of experience without naming an employer, program or deadline.`,
  ].join("\n"),
  DATA_RULES,
].join("\n\n");

export const TASK =
  "Draft the plan for the career in <student_goals>, for the student in <student_profile> and <student_plan>, using <catalog_data>.";

export interface CareerCandidatePayload {
  courseCode: string;
  title: string;
  terms: { code: string; basis: "scheduled" | "past-offerings" }[];
  curatedWhy?: string;
}

export interface CareerPlanData {
  catalog: {
    today: string;
    registrationTerm: string;
    upcomingTerms: { code: string; label: string; scheduled: boolean }[];
    career: CareerPayload;
    programs: { majors: string[]; minors: string[] };
    candidates: CareerCandidatePayload[];
  };
  profile: StudentProfilePayload;
  plan: { items: PlanItemPayload[] };
  goals: { career: string; careerName: string };
}

export function careerPlanRequest(data: CareerPlanData): GenerateRequest {
  return {
    feature: "career-plan",
    system: SYSTEM,
    userBlocks: [
      dataBlock("catalog_data", data.catalog),
      dataBlock("student_profile", data.profile),
      dataBlock("student_plan", data.plan),
      dataBlock("student_goals", data.goals),
      TASK,
    ],
    ...FEATURE_SETTINGS["career-plan"],
  };
}
