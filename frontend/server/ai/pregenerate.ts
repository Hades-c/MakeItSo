import "server-only";
import { z } from "zod";
import { getFlags } from "@/lib/flags";
import { TermCodeSchema } from "@/lib/types/common";
import { AI_MIN_CALL_MS, AI_REQUEST_BUDGET_MS } from "@/server/ai/config";
import { courseAboutOutcome, NO_DESCRIPTION_MESSAGE } from "@/server/ai/features/course-about";
import { aiConfigured } from "@/server/ai/provider";
import { getCourse, resolveTerms, searchCourses } from "@/server/catalog";

/**
 * The course-about pre-generation job (GET /api/cron/ai, Vercel Cron with CRON_SECRET): fills the shared
 * course-about entries of the registration term before students open the course pages, so their views are cache
 * hits. It counts under the "system" usage subject (no student quota) but respects AI_DAILY_TOKEN_BUDGET. Every
 * call is capped by the run's deadline (start + AI_REQUEST_BUDGET_MS, inside the route's maxDuration), and no new
 * call starts with less than AI_MIN_CALL_MS left: each run continues where the last one stopped (entries that
 * exist are cheap cache reads). The run stops on the first request the API rejects (400/401/403/404/422: a
 * deployment problem, e.g. a beta the organisation does not have), so one bad deployment makes one failing call
 * per worker, not one per course, and remembers nothing. With AI_ENABLED off or no provider configured it does
 * nothing.
 */

export const PregenerateResultSchema = z.object({
  skipped: z.enum(["disabled", "not_configured"]).nullable(),
  term: TermCodeSchema.nullable(),
  courses: z.number().int().min(0),
  generated: z.number().int().min(0),
  cached: z.number().int().min(0),
  /** Courses with no official description (nothing to summarize). */
  noDescription: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** "error": the API rejected a request (a deployment problem), so the run stopped. */
  stoppedEarly: z.enum(["deadline", "budget", "error"]).nullable(),
});
export type PregenerateResult = z.infer<typeof PregenerateResultSchema>;

export interface PregenerateOptions {
  /** All model work is over this many ms after the start (default AI_REQUEST_BUDGET_MS of the route's 120 s). */
  timeBudgetMs?: number;
  /** Parallel generations (default 4). */
  concurrency?: number;
}

async function registrationCodes(term: string): Promise<string[]> {
  const codes: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const result = await searchCourses({ term, pageSize: 100, page });
    codes.push(...result.items.map((item) => item.code));
    if (page * 100 >= result.total) break;
  }
  return [...new Set(codes)].sort();
}

export async function pregenerateCourseAbout(
  options: PregenerateOptions = {},
): Promise<PregenerateResult> {
  const result: PregenerateResult = {
    skipped: null,
    term: null,
    courses: 0,
    generated: 0,
    cached: 0,
    noDescription: 0,
    failed: 0,
    stoppedEarly: null,
  };
  if (!getFlags().ai) return { ...result, skipped: "disabled" };
  if (!aiConfigured()) return { ...result, skipped: "not_configured" };

  const deadlineAt = Date.now() + (options.timeBudgetMs ?? AI_REQUEST_BUDGET_MS);
  const { registration } = await resolveTerms();
  const codes = await registrationCodes(registration);
  result.term = registration;
  result.courses = codes.length;

  let next = 0;
  const worker = async () => {
    while (next < codes.length && !result.stoppedEarly) {
      if (deadlineAt - Date.now() < AI_MIN_CALL_MS) {
        result.stoppedEarly ??= "deadline";
        return;
      }
      const code = codes[next++]!;
      const course = await getCourse(registration, code);
      if (!course) continue;
      const { result: answer, origin } = await courseAboutOutcome(
        course,
        { userId: null },
        { deadlineAt },
      );
      if (origin === "rejected") {
        result.failed++;
        result.stoppedEarly = "error";
      } else if (answer.kind === "ok") {
        if (answer.cached) result.cached++;
        else result.generated++;
      } else if (answer.kind === "budget") {
        result.stoppedEarly = "budget";
      } else if (answer.kind === "unavailable" && answer.message === NO_DESCRIPTION_MESSAGE) {
        result.noDescription++;
      } else {
        result.failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
  return result;
}
