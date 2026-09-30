import "server-only";
import { termLabel, type TermCode } from "@/lib/term";
import {
  aiFailure,
  type AiFailure,
  type AiProvenance,
  type AiResult,
  type CourseAbout,
} from "@/lib/types/ai";
import type { Course } from "@/lib/types/catalog";
import { readShared, writeShared, hashInput } from "@/server/ai/cache";
import { AI_MODEL, TTL_MS } from "@/server/ai/config";
import { callModel, failureOf, okResult, spendOnGeneration } from "@/server/ai/features/common";
import { courseAboutPayload, type CourseAboutPayload } from "@/server/ai/payloads";
import { courseAboutRequest, OutputSchema, PROMPT_VERSION } from "@/server/ai/prompts/course-about";
import { cleanList, cleanParagraph } from "@/server/ai/sanitize";
import { budgetFailure, recordUsage } from "@/server/ai/usage";
import { getCourse } from "@/server/catalog";
import { ApiError } from "@/server/http/errors";

/**
 * Course page "About" (PLAN §6.1 W6 feature 1). A GLOBAL entry per distinct official catalog text: the key is
 * hash(feature, promptVersion, model, official title + description + prerequisites + requirements), so the entry
 * is shared by every student and every term with the same text, and nothing a student sends (they send only a
 * term and a code) can change it. 30-day TTL; no user regenerate; a refused or invalid answer is remembered for
 * 24 h (negative entry) so it is not regenerated on every view; hidden after 3 distinct reports. A miss counts
 * against the requesting student's daily generations; the pre-generation job (server/ai/pregenerate.ts) fills
 * the registration term ahead of time under the "system" subject.
 */

export const HIDDEN_MESSAGE =
  "This AI summary was reported by students and is hidden pending review.";
export const NO_DESCRIPTION_MESSAGE =
  "The catalog has no description for this course yet, so there is nothing to summarize.";

export interface CourseAboutResult {
  about: CourseAbout;
  provenance: AiProvenance;
}

export const SUMMARY_MAX = 600;

/** The input hash (= cache key) of a course's official text. */
export function courseAboutKey(payload: CourseAboutPayload): string {
  return hashInput({
    feature: "course-about",
    promptVersion: PROMPT_VERSION,
    model: AI_MODEL,
    payload,
  });
}

/** Post-validate the model's panel; null when nothing usable is left. */
export function cleanCourseAbout(raw: CourseAbout): CourseAbout | null {
  const summary = cleanParagraph(raw.summary, SUMMARY_MAX);
  if (!summary) return null;
  return {
    summary,
    goodFor: cleanList(raw.goodFor, { maxItems: 4, maxLength: 120 }),
    topics: cleanList(raw.topics, { maxItems: 6, maxLength: 60 }),
  };
}

type Requester = { userId: string } | { userId: null };

/** The About panel for a course (see the module comment). `userId: null` = the pre-generation job. */
export async function courseAboutFor(
  course: Course,
  requester: Requester,
): Promise<AiResult<CourseAboutResult>> {
  const payload = courseAboutPayload(course);
  const key = courseAboutKey(payload);
  const entry = await readShared<CourseAbout>("course-about", key);
  if (entry) {
    if (entry.hidden) return aiFailure("unavailable", HIDDEN_MESSAGE);
    if (entry.status !== "ok" || !entry.data) {
      return aiFailure(
        entry.status === "refused" ? "refused" : "invalid",
        entry.message ?? undefined,
      );
    }
    await recordUsage({
      userId: requester.userId,
      feature: "course-about",
      kind: "cache-hit",
      servedModel: entry.provenance.model,
    });
    return okResult(
      { about: entry.data, provenance: entry.provenance },
      { servedModel: entry.provenance.model, fallbackUsed: entry.fallbackUsed, cached: true },
    );
  }

  if (payload.descriptions.length === 0) return aiFailure("unavailable", NO_DESCRIPTION_MESSAGE);

  const spend: AiFailure | null = requester.userId
    ? await spendOnGeneration(requester.userId, { regeneration: false })
    : await budgetFailure();
  if (spend) return spend;

  const outcome = await callModel(OutputSchema, courseAboutRequest(payload), {
    userId: requester.userId,
  });
  const remember = async (status: "refused" | "invalid", message: string) => {
    await writeShared("course-about", key, {
      inputHash: key,
      promptVersion: PROMPT_VERSION,
      status,
      data: null,
      message,
      servedModel: outcome.servedModel,
      fallbackUsed: outcome.fallbackUsed,
      ttlMs: TTL_MS.negative,
    });
  };
  if (outcome.kind !== "ok") {
    const failure = failureOf(outcome);
    if (outcome.kind === "refused" || outcome.kind === "invalid") {
      await remember(outcome.kind, failure.message);
    }
    return failure;
  }
  const about = cleanCourseAbout(outcome.data);
  if (!about) {
    const failure = aiFailure("invalid");
    await remember("invalid", failure.message);
    return failure;
  }
  const provenance = await writeShared("course-about", key, {
    inputHash: key,
    promptVersion: PROMPT_VERSION,
    status: "ok",
    data: about,
    servedModel: outcome.servedModel,
    fallbackUsed: outcome.fallbackUsed,
    ttlMs: TTL_MS.courseAbout,
  });
  return okResult(
    { about, provenance },
    { servedModel: outcome.servedModel, fallbackUsed: outcome.fallbackUsed, cached: false },
  );
}

/** POST /api/ai/course-about: the course is loaded from the catalog (404 when not offered in that term). */
export async function generateCourseAbout(
  userId: string,
  input: { termCode: TermCode; courseCode: string },
): Promise<AiResult<CourseAboutResult>> {
  const course = await getCourse(input.termCode, input.courseCode);
  if (!course) {
    throw new ApiError(
      404,
      "not_found",
      `${input.courseCode} is not offered in ${termLabel(input.termCode)}.`,
    );
  }
  return courseAboutFor(course, { userId });
}
