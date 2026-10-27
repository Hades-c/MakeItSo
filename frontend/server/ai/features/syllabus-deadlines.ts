import "server-only";
import { parseTermCode, type TermCode } from "@/lib/term";
import type { AiResult } from "@/lib/types/ai";
import type { ExtractedDeadline } from "@/lib/types/syllabus";
import { requestDeadline } from "@/server/ai/client";
import {
  callModel,
  failureOf,
  okResult,
  refundIfNothingAnswered,
  spendOnGeneration,
} from "@/server/ai/features/common";
import {
  OutputSchema,
  syllabusDeadlinesRequest,
  type SyllabusDeadlinesData,
} from "@/server/ai/prompts/syllabus-deadlines";
import { cleanText, truncate } from "@/server/ai/sanitize";
import { ApiError } from "@/server/http/errors";

/**
 * Deadlines extracted from an uploaded syllabus (PLAN-UX §3 /syllabi). Personal, one-off: nothing is cached, so
 * every upload (including a replace) spends one generation. The student reviews the result before any of it is
 * saved to their plan (server/syllabi/records.ts uploadSyllabusImpl saves this as the syllabus's own record;
 * server/plan addSyllabusDeadlines is the separate, later save the review step calls).
 */

export interface SyllabusDeadlinesResult {
  deadlines: ExtractedDeadline[];
}

/** The syllabus text sent to the model; longer text is cut (a syllabus's deadlines are rarely past the first
 * several pages, and a long cut costs tokens without finding more). */
export const MAX_SYLLABUS_TEXT_CHARS = 20_000;

/** A deadline's date must fall within this many days of the term's academic year (misread dates, wrong years). */
const YEAR_SLACK_DAYS = 400;

function inRange(dueAt: string, academicYear: number): boolean {
  const date = new Date(`${dueAt}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const start = Date.UTC(academicYear - 1, 0, 1) - YEAR_SLACK_DAYS * 86_400_000;
  const end = Date.UTC(academicYear + 1, 11, 31) + YEAR_SLACK_DAYS * 86_400_000;
  return date.getTime() >= start && date.getTime() <= end;
}

/** Post-validate the model's list: clean titles, drop anything with no usable title or an out-of-range date. */
export function cleanSyllabusDeadlines(
  raw: { title: string; dueAt: string }[],
  academicYear: number,
): ExtractedDeadline[] {
  const seen = new Set<string>();
  const out: ExtractedDeadline[] = [];
  for (const item of raw) {
    const title = cleanText(item.title, { maxLength: 120 });
    if (!title || !inRange(item.dueAt, academicYear)) continue;
    const key = `${item.dueAt}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, dueAt: item.dueAt });
  }
  return out;
}

export async function extractSyllabusDeadlines(
  userId: string,
  input: { courseCode: string; termCode: TermCode; syllabusText: string },
): Promise<AiResult<SyllabusDeadlinesResult>> {
  const deadlineAt = requestDeadline();
  const term = parseTermCode(input.termCode);
  if (!term) throw new ApiError(400, "validation_failed", "Not a valid term.");

  const spend = await spendOnGeneration(userId, { regeneration: false });
  if ("failure" in spend) return spend.failure;

  const data: SyllabusDeadlinesData = {
    courseCode: input.courseCode,
    academicYear: term.year,
    syllabusText: truncate(input.syllabusText, MAX_SYLLABUS_TEXT_CHARS),
  };
  const outcome = await callModel(OutputSchema, syllabusDeadlinesRequest(data), {
    userId,
    deadlineAt,
  });
  if (outcome.kind !== "ok") {
    await refundIfNothingAnswered(spend.receipt, outcome);
    return failureOf(outcome);
  }
  const deadlines = cleanSyllabusDeadlines(outcome.data.deadlines, term.year);
  return okResult(
    { deadlines },
    { servedModel: outcome.servedModel, fallbackUsed: outcome.fallbackUsed, cached: false },
  );
}
