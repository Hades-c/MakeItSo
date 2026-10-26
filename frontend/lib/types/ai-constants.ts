/**
 * AI result constants without zod (lib/types/ai.ts builds its schemas from them and re-exports them; lib/api/account
 * re-exports UNVERIFIED_MESSAGE), so callApi and client islands can use them without carrying zod into the page.
 */

/**
 * What a signed-in account without a verified @davidson.edu mailbox is told (PLAN §1; owner to confirm, §8). Used by
 * defineRoute's "verified" 403 and by the AI routes' `unverified` result.
 */
export const UNVERIFIED_MESSAGE =
  "The alumni network and AI features are limited to verified @davidson.edu accounts.";

/**
 * The same rule while the owner's temporary AI_ALLOW_UNVERIFIED switch is on (server/ai/access.ts): AI needs an
 * @davidson.edu address, verified or not; the alumni network and cold-email drafts still need a verified one.
 */
export const UNVERIFIED_AI_ALLOWED_MESSAGE =
  "AI features are limited to @davidson.edu accounts, and the alumni network and cold-email drafts to verified ones.";

/** The same switch on, for cold e-mail (it uses alumni data, so it stays verified-only). */
export const ALUMNI_VERIFIED_ONLY_MESSAGE =
  "The alumni network and cold-email drafts are limited to verified @davidson.edu accounts.";

/**
 * What an account without the access it asked for is told, true in either state of AI_ALLOW_UNVERIFIED: the AI
 * routes' `unverified` result, defineRoute's "verified" 403, and the pages that explain the locks.
 */
export function verifiedOnlyMessage(allowUnverifiedAi: boolean): string {
  return allowUnverifiedAi ? UNVERIFIED_AI_ALLOWED_MESSAGE : UNVERIFIED_MESSAGE;
}

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
 *   unverified       not a verified @davidson.edu account (while AI_ALLOW_UNVERIFIED is on: not an @davidson.edu
 *                    account, or not a verified one for cold e-mail)
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
export type AiFailureKind = (typeof AI_FAILURE_KINDS)[number];

/**
 * HTTP status defineRoute sends for each result kind of an `aiResult` route (the body is the AiResult itself;
 * callApi returns it rather than throwing).
 */
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

/** Default student-facing message per failure kind (W6 may pass a more specific one). */
export const AI_FAILURE_MESSAGES: Readonly<Record<AiFailureKind, string>> = {
  refused: "The AI declined to answer this request.",
  truncated: "The AI's answer was cut off. Please try again.",
  invalid: "The AI's answer did not pass MakeItSo's checks, so it is not shown. Please try again.",
  quota: "You have used today's AI requests. They reset tomorrow.",
  budget: "AI is paused for today.",
  timeout: "The AI took too long to answer. Please try again.",
  unavailable: "AI is busy right now. Please try again in a minute.",
  not_configured: "AI features are not set up on this server yet.",
  disabled: "AI features are turned off.",
  consent_required: "Turn on AI features in your profile to use this.",
  unverified: UNVERIFIED_MESSAGE,
};
