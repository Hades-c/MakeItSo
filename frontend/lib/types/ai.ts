import { z } from "zod";
import { PlanDraftSchema } from "@/lib/types/plan";
import { CourseCodeSchema, IsoDateTimeSchema, TermCodeSchema } from "@/lib/types/common";

/**
 * AI results (PLAN §4.1.8, §6.1 W6). Every AI route answers with an AiResult; the UI renders `ok` data as text
 * only with the "AI · verify with your advisor" chip, and every failure kind in ErrorState with a Retry where it
 * makes sense. Model: Claude Sonnet 5.5 via server/ai (W6); outputs are validated with these zod schemas.
 * The UI never renders model-written prerequisites, difficulty or workload.
 */

export const AI_FEATURES = [
  "course-about",
  "plan-suggestions",
  "career-plan",
  "cold-email",
  "professor-summary",
] as const;
export const AiFeatureSchema = z.enum(AI_FEATURES);
export type AiFeature = z.infer<typeof AiFeatureSchema>;

/**
 * Failure kinds:
 *   refused          the model declined (stop_reason "refusal")
 *   truncated        hit max_tokens
 *   invalid          output failed schema/grounding validation (> 30% of suggestions dropped counts as invalid)
 *   quota            the student's daily generation quota is used up
 *   budget           the global AI_DAILY_TOKEN_BUDGET circuit breaker is open ("AI is paused for today")
 *   timeout          the provider timed out
 *   unavailable      provider busy / connection error
 *   not_configured   no API key / provider configured
 *   disabled         AI_ENABLED is off (or RMP_SUMMARIES_ENABLED for professor summaries)
 *   consent_required the student has not opted in (aiConsentAt unset, or no 18+ attestation)
 *   unverified       not a verified @davidson.edu account
 */
export const AI_FAILURE_KINDS = [
  "refused",
  "truncated",
  "invalid",
  "quota",
  "budget",
  "timeout",
  "unavailable",
  "not_configured",
  "disabled",
  "consent_required",
  "unverified",
] as const;
export const AiFailureKindSchema = z.enum(AI_FAILURE_KINDS);
export type AiFailureKind = z.infer<typeof AiFailureKindSchema>;

/** HTTP status an AI route uses for each result kind (the body is always the AiResult). */
export const AI_RESULT_STATUS: Readonly<Record<"ok" | AiFailureKind, number>> = {
  ok: 200,
  refused: 422,
  truncated: 502,
  invalid: 502,
  quota: 429,
  budget: 503,
  timeout: 504,
  unavailable: 503,
  not_configured: 503,
  disabled: 404,
  consent_required: 403,
  unverified: 403,
};

export const AiFailureSchema = z.object({
  kind: AiFailureKindSchema,
  message: z.string(),
});
export type AiFailure = z.infer<typeof AiFailureSchema>;

/**
 * `{kind:'ok', data, servedModel, fallbackUsed, cached}` or a failure `{kind, message}`.
 * - servedModel: `res.model` of the response that produced `data` (may differ after server-side fallback).
 * - fallbackUsed: the server-side fallback served the answer (from usage.iterations).
 * - cached: served from aicache_v2 without a model call.
 */
export function aiResultSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("ok"),
      data,
      servedModel: z.string(),
      fallbackUsed: z.boolean(),
      cached: z.boolean(),
    }),
    AiFailureSchema,
  ]);
}

export type AiOk<T> = {
  kind: "ok";
  data: T;
  servedModel: string;
  fallbackUsed: boolean;
  cached: boolean;
};
export type AiResult<T> = AiOk<T> | AiFailure;

/** Where a shared cached entry came from (shown on course-about / professor-summary). */
export const AiProvenanceSchema = z.object({
  model: z.string(),
  promptVersion: z.string(),
  inputHash: z.string(),
  generatedAt: IsoDateTimeSchema,
});
export type AiProvenance = z.infer<typeof AiProvenanceSchema>;

// ---- Per-feature outputs (also the structured-output schemas W6 sends to the model) -----------------------------
// Keep them flat and free of URLs; W6 post-validates lengths and strips URLs/e-mail addresses.

/** Course page "About" panel (shared per term + course; effort low). */
export const CourseAboutSchema = z.object({
  summary: z.string(),
  /** Short "Good for students who…" bullets. */
  goodFor: z.array(z.string()),
  /** Themes/topics covered, from the official description only. */
  topics: z.array(z.string()),
});
export type CourseAbout = z.infer<typeof CourseAboutSchema>;

/** Plan suggestions: stored as a PlanDraft (kind "plan-suggestions"). */
export const PlanSuggestionsSchema = z.object({
  items: z.array(
    z.object({
      termCode: TermCodeSchema,
      courseCode: CourseCodeSchema,
      reason: z.string(),
    }),
  ),
  notes: z.array(z.string()),
});
export type PlanSuggestions = z.infer<typeof PlanSuggestionsSchema>;

/** Career plan. `majors`/`minors` must be official Acalog names (W6 builds the enum at request time). */
export const CareerPlanSchema = z.object({
  overview: z.string(),
  majors: z.array(z.string()),
  minors: z.array(z.string()),
  courses: z.array(
    z.object({ courseCode: CourseCodeSchema, termCode: TermCodeSchema, reason: z.string() }),
  ),
  experiences: z.array(z.object({ title: z.string(), when: z.string(), why: z.string() })),
});
export type CareerPlan = z.infer<typeof CareerPlanSchema>;

/** Cold email to a contactable alumnus. The body contains the literal `{{studentName}}`, filled in the browser. */
export const ColdEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export type ColdEmail = z.infer<typeof ColdEmailSchema>;

/** Professor review summary (only with RMP_SUMMARIES_ENABLED; reviews are untrusted input). */
export const ProfessorSummarySchema = z.object({
  summary: z.string(),
  themes: z.array(z.string()),
});
export type ProfessorSummary = z.infer<typeof ProfessorSummarySchema>;

/** A stored plan draft returned by plan-suggestions / career-plan routes alongside the model output. */
export const AiPlanDraftResultSchema = aiResultSchema(PlanDraftSchema);

/** The literal placeholder a cold email body must contain. */
export const STUDENT_NAME_PLACEHOLDER = "{{studentName}}";
