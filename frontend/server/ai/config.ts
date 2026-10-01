import "server-only";
import type { AiFeature } from "@/lib/types/ai";
import type { RateLimitRule } from "@/server/http/rate-limit";

/**
 * Fixed settings of the AI layer (PLAN §1 "AI", §6.1 W6). Everything that varies per deployment comes from
 * server/env.ts (ANTHROPIC_API_KEY, AI_PROVIDER, AI_ENABLED, AI_DAILY_TOKEN_BUDGET, RMP_SUMMARIES_ENABLED).
 */

/** Claude Sonnet 5.5 for every feature (owner decision, PLAN §1). */
export const AI_MODEL = "claude-sonnet-5-5";

/**
 * Server-side refusal fallback: `fallbacks: "default"` lets the API re-run a declined request on the model
 * Anthropic recommends for the refusal category. The scalar "default" form needs exactly this beta header (the
 * array form uses a different one; pairing them wrongly is a 400).
 */
export const AI_BETAS = ["server-side-fallback-2026-07-01"] as const;
export const AI_FALLBACKS = "default" as const;

/**
 * Defaults of the SDK client: 45 s per attempt, one retry. Each call also gets per-request options derived from
 * the time left in the request (server/ai/client.ts callBudget), so no call can outlive maxDuration.
 */
export const AI_TIMEOUT_MS = 45_000;
export const AI_MAX_RETRIES = 1;

/** `export const maxDuration` of every AI route (seconds). */
export const AI_ROUTE_MAX_DURATION = 120;

/**
 * All model work of one request (or one cron run) must be over this long after it started: maxDuration minus
 * 10 s for the route's own reads and writes, so the platform never cuts a request off before its usage is
 * recorded and its AiResult is sent.
 */
export const AI_REQUEST_BUDGET_MS = 110_000;
/** No model call is started with less time than this left (it is answered as a timeout instead). */
export const AI_MIN_CALL_MS = 15_000;
/** The grounding retry is only started with at least this much time left. */
export const AI_MIN_RETRY_MS = 30_000;
/** Allowance for the SDK's back-off between its two attempts (0.5 s × jitter; retry-after is capped by the abort signal). */
export const AI_RETRY_BACKOFF_ALLOWANCE_MS = 2_000;

export type AiEffort = "low" | "medium" | "high";

export interface FeatureSettings {
  /** output_config.effort (thinking stays adaptive: `thinking` is never sent). */
  effort: AiEffort;
  /** max_tokens: output incl. adaptive thinking. */
  maxTokens: number;
}

/** PLAN §6.1 W6 "Effort per feature". */
export const FEATURE_SETTINGS: Readonly<Record<AiFeature, FeatureSettings>> = {
  "course-about": { effort: "low", maxTokens: 3_000 },
  "plan-suggestions": { effort: "high", maxTokens: 12_000 },
  "career-plan": { effort: "high", maxTokens: 12_000 },
  "cold-email": { effort: "low", maxTokens: 3_000 },
  "professor-summary": { effort: "low", maxTokens: 3_000 },
};

/** Cache-miss generations per student per America/New_York day, all features together. */
export const DAILY_GENERATION_QUOTA = 20;
/** Regenerations of personal items per student per day. */
export const DAILY_REGENERATION_QUOTA = 3;

const DAY_MS = 86_400_000;

/** How long entries live (PLAN §6.1 W6). */
export const TTL_MS = {
  courseAbout: 30 * DAY_MS,
  professorSummary: 7 * DAY_MS,
  personal: 30 * DAY_MS,
  /** Refused / invalid shared items (answers the model gave, never API errors) are not retried for a day. */
  negative: DAY_MS,
  /** A hidden shared entry (3 reports) is kept this long for the admin, whatever its own lifetime was. */
  hidden: 365 * DAY_MS,
} as const;

/** Distinct reporters that hide a shared entry pending review. */
export const REPORTS_TO_HIDE = 3;

/** More than this share of suggested courses failing grounding makes the whole answer invalid. */
export const MAX_DROPPED_SHARE = 0.3;

/** Professor summaries need at least this many ratings. */
export const MIN_RATINGS_FOR_SUMMARY = 5;

/** Per-user request limit on the AI routes, cache hits included (defineRoute rateLimit; generic 429). */
export const AI_ROUTE_RATE_LIMIT: RateLimitRule = {
  name: "ai",
  limit: 60,
  windowSec: 600,
  by: "user",
};

/** "Report this" limit per user. */
export const AI_REPORT_RATE_LIMIT: RateLimitRule = {
  name: "ai-report",
  limit: 20,
  windowSec: 3_600,
  by: "user",
};
