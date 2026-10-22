import "server-only";
import { termLabel, type TermCode } from "@/lib/term";
import { aiFailure, type AiProvenance, type AiResult, type CourseAbout } from "@/lib/types/ai";
import type { Course } from "@/lib/types/catalog";
import { readShared, writeShared, hashInput } from "@/server/ai/cache";
import { requestDeadline, type FailureOrigin } from "@/server/ai/client";
import { AI_MODEL, TTL_MS } from "@/server/ai/config";
import {
  callModel,
  failureOf,
  okResult,
  refundIfNothingAnswered,
  spendOnGeneration,
} from "@/server/ai/features/common";
import { courseAboutPayload, type CourseAboutPayload } from "@/server/ai/payloads";
import { courseAboutRequest, OutputSchema, PROMPT_VERSION } from "@/server/ai/prompts/course-about";
import {
  cleanList,
  cleanParagraph,
  hasForbiddenClaim,
  officialDifficultyWords,
  type SentenceFilter,
} from "@/server/ai/sanitize";
import { anyCourseCode, unknownCourses } from "@/server/ai/text-grounding";
import { budgetFailure, recordUsage, type QuotaReceipt } from "@/server/ai/usage";
import { getCourse } from "@/server/catalog";
import { ApiError } from "@/server/http/errors";

/**
 * Course page "About" (PLAN §6.1 W6 feature 1). A GLOBAL entry per distinct official catalog text: the key is
 * hash(feature, promptVersion, model, official title + description + prerequisites + requirements), so the entry
 * is shared by every student and every term with the same text, and nothing a student sends (they send only a
 * term and a code) can change it. 30-day TTL; no user regenerate; hidden after 3 distinct reports, and then never
 * regenerated until an admin purges it (server/ai/reports.ts). A refusal, or an answer that fails parsing,
 * the schema or post-validation, is remembered for 24 h (negative entry) so it is not regenerated on every view;
 * API errors (a rejected request, a timeout, a rate limit…) are never remembered: they say nothing about the
 * course, and the next view tries again. A miss counts against the requesting student's daily generations (given
 * back when the API failed before answering); the pre-generation job (server/ai/pregenerate.ts) fills the
 * registration term ahead of time under the "system" subject.
 *
 * Post-validation drops every sentence or list item that names another course (besides the course's own code and
 * cross-listings, the only codes the model could name come from prerequisites or sequences), talks about
 * prerequisites or eligibility, or makes a difficulty or workload claim the official description does not make
 * itself (sanitize.ts).
 */

export const HIDDEN_MESSAGE =
  "This AI summary was reported by students and is hidden pending review.";
/** What a remembered (negative) entry says: retrying now cannot help, the entry is retried tomorrow. */
export const REMEMBERED_REFUSAL_MESSAGE =
  "The AI declined to summarize this course. MakeItSo will try again tomorrow.";
export const REMEMBERED_INVALID_MESSAGE =
  "The AI's summary of this course did not pass MakeItSo's checks, so it is not shown. MakeItSo will try again tomorrow.";
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

/** The official text difficulty words may come from (title and descriptions; never the prerequisites). */
export function officialAboutText(payload: CourseAboutPayload): string {
  return [payload.title, ...payload.descriptions].join("\n");
}

/** The course's own listing codes (its code and cross-listings): the only codes the panel may name. */
export function ownCodes(course: Course): string[] {
  return [
    course.code,
    ...course.sections.flatMap((section) => section.crossListings.map((c) => c.courseCode)),
  ];
}

/**
 * Post-validate the model's panel; null when nothing usable is left. `official.text` is the official title and
 * description (difficulty words it uses are not the model's claims), `official.codes` the course's own codes.
 */
export function cleanCourseAbout(
  raw: CourseAbout,
  official: { text?: string; codes?: readonly string[] } = {},
): CourseAbout | null {
  const words = officialDifficultyWords(official.text ?? "");
  const otherCourse = official.codes?.length
    ? unknownCourses(new Set(official.codes))
    : anyCourseCode;
  const drop: SentenceFilter = (text) => otherCourse(text) || hasForbiddenClaim(text, words);
  const summary = cleanParagraph(raw.summary, SUMMARY_MAX, drop);
  if (!summary) return null;
  return {
    summary,
    goodFor: cleanList(raw.goodFor, { maxItems: 4, maxLength: 120, drop }),
    topics: cleanList(raw.topics, { maxItems: 6, maxLength: 60, drop }),
  };
}

type Requester = { userId: string } | { userId: null };

/** An About answer and, for a failed model call, where the failure came from (the pre-generation job stops on "rejected"). */
export interface CourseAboutOutcome {
  result: AiResult<CourseAboutResult>;
  origin: FailureOrigin | null;
}

/** The About panel for a course (see the module comment). `userId: null` = the pre-generation job. */
export async function courseAboutFor(
  course: Course,
  requester: Requester,
  options: { deadlineAt?: number } = {},
): Promise<AiResult<CourseAboutResult>> {
  return (await courseAboutOutcome(course, requester, options)).result;
}

export async function courseAboutOutcome(
  course: Course,
  requester: Requester,
  { deadlineAt = requestDeadline() }: { deadlineAt?: number } = {},
): Promise<CourseAboutOutcome> {
  const done = (result: AiResult<CourseAboutResult>, origin: FailureOrigin | null = null) => ({
    result,
    origin,
  });
  const payload = courseAboutPayload(course);
  const key = courseAboutKey(payload);
  const entry = await readShared<CourseAbout>("course-about", key);
  if (entry) {
    if (entry.hidden) return done(aiFailure("unavailable", HIDDEN_MESSAGE));
    if (entry.status !== "ok" || !entry.data) {
      return done(
        entry.status === "refused"
          ? aiFailure("refused", REMEMBERED_REFUSAL_MESSAGE)
          : aiFailure("invalid", REMEMBERED_INVALID_MESSAGE),
      );
    }
    // Students' views count as cache hits; the pre-generation job's checks do not.
    if (requester.userId) {
      await recordUsage({
        userId: requester.userId,
        feature: "course-about",
        kind: "cache-hit",
        servedModel: entry.provenance.model,
      });
    }
    return done(
      okResult(
        { about: entry.data, provenance: entry.provenance },
        { servedModel: entry.provenance.model, fallbackUsed: entry.fallbackUsed, cached: true },
      ),
    );
  }

  if (payload.descriptions.length === 0) {
    return done(aiFailure("unavailable", NO_DESCRIPTION_MESSAGE));
  }

  let receipt: QuotaReceipt | null = null;
  if (requester.userId) {
    const spend = await spendOnGeneration(requester.userId, { regeneration: false });
    if ("failure" in spend) return done(spend.failure);
    receipt = spend.receipt;
  } else {
    const budget = await budgetFailure();
    if (budget) return done(budget);
  }

  const outcome = await callModel(OutputSchema, courseAboutRequest(payload), {
    userId: requester.userId,
    deadlineAt,
  });
  // Only answers the model gave are remembered; an API error says nothing about the course.
  const remember = async (status: "refused" | "invalid") => {
    await writeShared("course-about", key, {
      inputHash: key,
      promptVersion: PROMPT_VERSION,
      status,
      data: null,
      message: status === "refused" ? REMEMBERED_REFUSAL_MESSAGE : REMEMBERED_INVALID_MESSAGE,
      servedModel: outcome.servedModel,
      fallbackUsed: outcome.fallbackUsed,
      ttlMs: TTL_MS.negative,
    });
  };
  if (outcome.kind !== "ok") {
    await refundIfNothingAnswered(receipt, outcome);
    if (
      outcome.origin === "response" &&
      (outcome.kind === "refused" || outcome.kind === "invalid")
    ) {
      await remember(outcome.kind);
    }
    return done(failureOf(outcome), outcome.origin);
  }
  const about = cleanCourseAbout(outcome.data, {
    text: officialAboutText(payload),
    codes: ownCodes(course),
  });
  if (!about) {
    await remember("invalid");
    return done(aiFailure("invalid"), "response");
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
  // Reported and hidden while this answer was being written: nothing was stored, and nothing is shown.
  if (!provenance) return done(aiFailure("unavailable", HIDDEN_MESSAGE));
  return done(
    okResult(
      { about, provenance },
      { servedModel: outcome.servedModel, fallbackUsed: outcome.fallbackUsed, cached: false },
    ),
  );
}

/** POST /api/ai/course-about: the course is loaded from the catalog (404 when not offered in that term). */
export async function generateCourseAbout(
  userId: string,
  input: { termCode: TermCode; courseCode: string },
): Promise<AiResult<CourseAboutResult>> {
  const deadlineAt = requestDeadline();
  const course = await getCourse(input.termCode, input.courseCode);
  if (!course) {
    throw new ApiError(
      404,
      "not_found",
      `${input.courseCode} is not offered in ${termLabel(input.termCode)}.`,
    );
  }
  return courseAboutFor(course, { userId }, { deadlineAt });
}
