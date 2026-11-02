import "server-only";
import * as z from "zod";
import { dataBlock, DATA_RULES } from "@/server/ai/blocks";
import type { GenerateRequest } from "@/server/ai/client";
import { FEATURE_SETTINGS } from "@/server/ai/config";
import type { CareerPayload, CareerSummersProfilePayload } from "@/server/ai/payloads";

/**
 * Summer picks for a career path (personal; effort medium): the curated career path, the summer options MakeItSo
 * lists (server/ai/summer-catalog.ts: this path's, the other paths', and Davidson office programs for any path) and
 * the student's allow-listed profile with the coming summer. The model answers with option ids, which the server
 * checks against the catalog (server/ai/features/career-summers.ts), and with short personal text; every fact the
 * page shows about an option comes from the content, never from the answer.
 */
export const PROMPT_VERSION = "career-summers/1";

export const OutputSchema = z.object({
  outlook: z
    .string()
    .describe("One or two sentences on which kinds of summer fit the student's coming summer"),
  picks: z.array(
    z.object({
      id: z.string().describe("The exact id of one option in <catalog_data>"),
      why: z.string().describe("One or two sentences, at most 40 words"),
      nextStep: z.string().describe("One short first step, or an empty string"),
    }),
  ),
});
export type CareerSummersOutput = z.infer<typeof OutputSchema>;

export const MAX_PICKS = 4;

export const SYSTEM = [
  "You recommend summer options to a Davidson College student exploring one career path in MakeItSo, an independent planner. MakeItSo is not an official Davidson service: students confirm every detail on the program's own page and with the Matthews Center for Career Development.",
  [
    "You receive:",
    "- <catalog_data>: today's date, the career path (a curated summary, what people in it do, related departments and programs, and Davidson resources) and the summer options MakeItSo lists. Each option has an id, its name, who runs it, a line on what it is, who it is for and its timing as the program publishes them, a published amount for some Davidson programs, and the career paths whose pages list it; thisPath is true for the options on this career path's own page.",
    "- <student_profile>: majors, minors, graduation year, class standing, career interests (career-path slugs), aspirations (slugs for what the student hopes to do at Davidson, such as study-abroad or research; often empty) and comingSummer: its year and where it falls in the student's time at Davidson (before-first-year, after-first-year, after-sophomore-year, after-junior-year or after-graduation).",
    "- <student_goals>: the career path the student is looking at.",
  ].join("\n"),
  [
    "Write:",
    "- outlook: one or two sentences, honest about the student's year: what kinds of summer usually fit someone at this point (early students often start with research programs for early students, funded exploration, service or study; students after their junior year often look for internships and programs for advanced students). Say plainly when most options on this path suit students further along.",
    `- picks: at most ${MAX_PICKS} options, best first, chosen only by id from <catalog_data>. Prefer this path's own options (thisPath) when they fit the student; add options listed for other paths, or Davidson programs that fund or offer a summer for any path, when they fit this student and this career. Leave out an option whose "for" line plainly does not match the student's coming summer. If nothing fits well, return an empty list and say so in the outlook: never add an option only to fill the list.`,
    '- for each pick, "why": one or two sentences (at most 40 words) on why it fits THIS student, from their year, majors, minors, interests or aspirations; and "nextStep": one short first step that names only things in <catalog_data> (for example reading the program\'s page or talking with the office that runs it), or an empty string.',
    "- Never write dates, deadlines, amounts, eligibility rules or requirements, and never say the student qualifies: the page shows each option's own published details next to your text.",
  ].join("\n"),
  DATA_RULES,
].join("\n\n");

export const TASK =
  "Recommend summer options for the career in <student_goals>, for the student in <student_profile>, using <catalog_data>.";

/** One option as the model reads it (null fields left out). */
export interface SummerOptionPayload {
  id: string;
  name: string;
  runBy: string;
  about: string;
  for?: string;
  timing?: string;
  amount?: string;
  listedFor: string[];
  thisPath: boolean;
}

export interface CareerSummersData {
  catalog: { today: string; career: CareerPayload; options: SummerOptionPayload[] };
  profile: CareerSummersProfilePayload;
  goals: { career: string; careerName: string };
}

export function careerSummersRequest(data: CareerSummersData): GenerateRequest {
  return {
    feature: "career-summers",
    system: SYSTEM,
    userBlocks: [
      dataBlock("catalog_data", data.catalog),
      dataBlock("student_profile", data.profile),
      dataBlock("student_goals", data.goals),
      TASK,
    ],
    ...FEATURE_SETTINGS["career-summers"],
  };
}
