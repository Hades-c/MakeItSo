import "server-only";
import { ColdEmailSchema, STUDENT_NAME_PLACEHOLDER } from "@/lib/types/ai";
import { dataBlock, DATA_RULES } from "@/server/ai/blocks";
import type { GenerateRequest } from "@/server/ai/client";
import { FEATURE_SETTINGS } from "@/server/ai/config";
import type { AlumnusPayload, StudentProfilePayload } from "@/server/ai/payloads";

/**
 * Cold e-mail to a contactable, verified alumnus (personal; effort low). The model sees only the alumnus's
 * displayed directory fields and the student's allow-listed profile; the student's name is the literal
 * {{studentName}}, which the browser fills in. Output: lib/types/ai.ts ColdEmailSchema.
 */
export const PROMPT_VERSION = "cold-email/1";

export const OutputSchema = ColdEmailSchema;

export const SYSTEM = [
  "You draft a short, respectful first e-mail from a Davidson College student to a Davidson alumnus, for MakeItSo, an independent planner (not an official Davidson service). The student reads and edits the draft and sends it themselves.",
  [
    "Rules:",
    "- Use only the alumnus facts in <catalog_data> (name, class year, majors, role, organization). Do not guess anything else about them.",
    `- Use only the student facts in <student_profile> and <student_goals>. The student's name is unknown: write the exact placeholder ${STUDENT_NAME_PLACEHOLDER} wherever the name belongs, including the sign-off.`,
    "- subject: at most 10 words.",
    "- body: 90 to 160 words in three short paragraphs and a sign-off: who the student is (class year and majors), why this alumnus (their field), one modest, specific ask (a 15 to 20 minute conversation), and thanks.",
    "- Do not flatter, do not claim a connection that is not in the data, do not ask for a job or a referral, and do not include links, phone numbers or e-mail addresses.",
  ].join("\n"),
  DATA_RULES,
].join("\n\n");

export const TASK =
  "Draft the e-mail from the student in <student_profile> and <student_goals> to the alumnus in <catalog_data>.";

export interface ColdEmailData {
  catalog: { alumnus: AlumnusPayload; career: { name: string; summary: string } | null };
  profile: StudentProfilePayload;
  goals: { career: string | null };
}

export function coldEmailRequest(data: ColdEmailData): GenerateRequest {
  return {
    feature: "cold-email",
    system: SYSTEM,
    userBlocks: [
      dataBlock("catalog_data", data.catalog),
      dataBlock("student_profile", data.profile),
      dataBlock("student_goals", data.goals),
      TASK,
    ],
    ...FEATURE_SETTINGS["cold-email"],
  };
}
