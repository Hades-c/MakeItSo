import "server-only";
import { aiFailure, STUDENT_NAME_PLACEHOLDER, type AiResult, type ColdEmail } from "@/lib/types/ai";
import { hashInput, readPersonal, writePersonal } from "@/server/ai/cache";
import { AI_MODEL, TTL_MS } from "@/server/ai/config";
import { callModel, failureOf, okResult, spendOnGeneration } from "@/server/ai/features/common";
import { alumnusPayload, studentProfilePayload } from "@/server/ai/payloads";
import {
  coldEmailRequest,
  OutputSchema,
  PROMPT_VERSION,
  type ColdEmailData,
} from "@/server/ai/prompts/cold-email";
import { cleanText } from "@/server/ai/sanitize";
import { recordUsage } from "@/server/ai/usage";
import { getProfile } from "@/server/auth/profile";
import { getAlumnus } from "@/server/content/alumni";
import { getCareer } from "@/server/content/careers";
import { ApiError } from "@/server/http/errors";
import { programNames } from "@/server/programs";

/**
 * Cold e-mail (PLAN §6.1 W6 feature 4): only to contactable verified alumni (server/content/alumni), from their
 * displayed fields and the student's allow-listed profile. The body always carries the literal {{studentName}}
 * (the browser fills in the name; the server never sends it to the model). Personal, cached 30 days per student
 * and alumnus (+ career).
 */

export interface ColdEmailResult {
  email: ColdEmail;
}

const SUBJECT_MAX = 120;
const BODY_MAX = 1_800;

/** Spellings of a name slot a model might use instead of the placeholder. */
const NAME_SLOT_PATTERN =
  /\{\{\s*student[\s_-]*name\s*\}\}|\[\s*(?:your|student(?:'s)?|my)\s+(?:full\s+)?name\s*\]|<\s*(?:your|student(?:'s)?)\s+name\s*>/gi;

/** Clean the draft and make sure {{studentName}} is in the body (appended as the sign-off when missing). */
export function cleanColdEmail(raw: ColdEmail): ColdEmail | null {
  const subject = cleanText(raw.subject.replace(NAME_SLOT_PATTERN, ""), { maxLength: SUBJECT_MAX });
  let body = cleanText(raw.body.replace(NAME_SLOT_PATTERN, STUDENT_NAME_PLACEHOLDER), {
    maxLength: BODY_MAX,
    multiline: true,
  })
    // Any other template slot the model invented is removed.
    .replace(/\{\{(?!studentName\}\})[^{}]{0,40}\}\}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!subject || !body) return null;
  if (!body.includes(STUDENT_NAME_PLACEHOLDER))
    body = `${body}\n\nBest,\n${STUDENT_NAME_PLACEHOLDER}`;
  return { subject, body };
}

export async function generateColdEmail(
  userId: string,
  input: { alumnusId: string; careerSlug?: string; regenerate: boolean },
): Promise<AiResult<ColdEmailResult>> {
  const alumnus = getAlumnus(input.alumnusId);
  const alumnusData = alumnus ? alumnusPayload(alumnus) : null;
  if (!alumnusData) {
    throw new ApiError(404, "not_found", "That alumnus is not available for a cold e-mail.");
  }
  const career = input.careerSlug ? getCareer(input.careerSlug) : null;
  if (input.careerSlug && !career)
    throw new ApiError(404, "not_found", "There is no such career path.");

  const [profile, names] = await Promise.all([getProfile(userId), programNames()]);
  const data: ColdEmailData = {
    catalog: {
      alumnus: alumnusData,
      career: career ? { name: career.name, summary: career.summary } : null,
    },
    profile: studentProfilePayload(profile, names),
    goals: { career: career?.name ?? null },
  };
  const inputHash = hashInput({
    feature: "cold-email",
    promptVersion: PROMPT_VERSION,
    model: AI_MODEL,
    data,
  });
  const key = career ? `${input.alumnusId}:${career.slug}` : input.alumnusId;

  const cached = await readPersonal<ColdEmailResult>("cold-email", userId, key);
  if (
    !input.regenerate &&
    cached?.status === "ok" &&
    cached.inputHash === inputHash &&
    cached.data
  ) {
    await recordUsage({
      userId,
      feature: "cold-email",
      kind: "cache-hit",
      servedModel: cached.provenance.model,
    });
    return okResult(cached.data, {
      servedModel: cached.provenance.model,
      fallbackUsed: cached.fallbackUsed,
      cached: true,
    });
  }

  const regeneration = input.regenerate && cached?.status === "ok";
  const spend = await spendOnGeneration(userId, { regeneration });
  if (spend) return spend;

  const outcome = await callModel(OutputSchema, coldEmailRequest(data), { userId, regeneration });
  if (outcome.kind !== "ok") return failureOf(outcome);
  const email = cleanColdEmail(outcome.data);
  if (!email) return aiFailure("invalid");

  await writePersonal("cold-email", userId, key, {
    inputHash,
    promptVersion: PROMPT_VERSION,
    status: "ok",
    data: { email } satisfies ColdEmailResult,
    servedModel: outcome.servedModel,
    fallbackUsed: outcome.fallbackUsed,
    ttlMs: TTL_MS.personal,
  });
  return okResult(
    { email },
    { servedModel: outcome.servedModel, fallbackUsed: outcome.fallbackUsed, cached: false },
  );
}
