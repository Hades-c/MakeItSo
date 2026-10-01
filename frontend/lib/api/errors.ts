import * as z from "zod";

/**
 * The JSON error body every route handler returns (PLAN §2 "API errors"):
 *   { "error": { "code": "...", "message": "...", "issues"?: [{ "path": "...", "message": "..." }] } }
 * `message` is safe to show to the student; `issues` lists field-level validation problems.
 *
 * Codes (the HTTP status carries the finer detail):
 *   bad_request        400 malformed JSON / bad id, 413 body too large, 415 not application/json
 *   validation_failed  400 zod validation (with issues)
 *   unauthorized       401 not signed in (or bad cron secret)
 *   forbidden          403 signed in but not allowed (unverified, not admin, cross-site request)
 *   not_found          404
 *   conflict           409 duplicate (e.g. E11000)
 *   rate_limited       429 (with Retry-After)
 *   unavailable        501 not implemented yet, 503 upstream/config unavailable
 *   internal           500 unexpected (logged server-side, never leaked)
 */
export const API_ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "unavailable",
  "internal",
] as const;
export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiIssueSchema = z.object({ path: z.string(), message: z.string() });
export type ApiIssue = z.infer<typeof ApiIssueSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    issues: z.array(ApiIssueSchema).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
