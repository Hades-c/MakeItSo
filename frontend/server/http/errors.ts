import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApiErrorBody, ApiErrorCode, ApiIssue } from "@/lib/api/errors";
import { EnvError } from "@/server/env";

/**
 * Typed JSON errors for route handlers (PLAN §2 "API errors"). Every error response has the shape
 *   { "error": { "code": "...", "message": "...", "issues"?: [{ "path": "...", "message": "..." }] } }
 * and `Cache-Control: private, no-store`. The codes and body schema live in lib/api/errors.ts (shared with the
 * client); this module maps thrown values to responses.
 */

export type { ApiErrorBody, ApiErrorCode, ApiIssue };

export const NO_STORE = "private, no-store";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiIssue[],
    /** Extra response headers, e.g. Retry-After for 429. */
    readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The 501 every not-yet-implemented service stub throws (surfaced as `unavailable`). */
export function notImplemented(what: string): ApiError {
  return new ApiError(501, "unavailable", `${what} is not implemented yet.`);
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  issues?: ApiIssue[],
  headers?: Readonly<Record<string, string>>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...(issues ? { issues } : {}) } },
    { status, headers: { ...headers, "Cache-Control": NO_STORE } },
  );
}

export function zodIssues(error: z.ZodError): ApiIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

function hasName(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === name;
}

/** MongoDB duplicate key (E11000), from the driver or a mongoose bulk write. */
export function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 11000 || code === 11001;
}

/** A mongoose ValidationError's per-path messages. */
function mongooseIssues(error: unknown): ApiIssue[] {
  const errors = (error as { errors?: Record<string, { message?: unknown }> }).errors ?? {};
  return Object.entries(errors).map(([path, e]) => ({
    path,
    message: typeof e?.message === "string" ? e.message : "is invalid",
  }));
}

/**
 * Convert anything thrown by a handler into a typed JSON error response. 500s are logged, never leaked.
 *   ApiError → its status · mongoose CastError → 400 bad_request · mongoose ValidationError → 400
 *   validation_failed · E11000 → 409 conflict · ExternalFetchError (upstream down) → 503 unavailable ·
 *   a bare ZodError, EnvError and anything else → 500 internal.
 * A bare ZodError is a server bug or bad stored/upstream data (a service's own `.parse`): the student must not see
 * internal field paths. Request validation is a 400 because defineRoute converts it into
 * ApiError(400, "validation_failed", ..., zodIssues(error)) before any handler code runs.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.code, error.message, error.issues, error.headers);
  }
  if (hasName(error, "CastError")) {
    return jsonError(400, "bad_request", "That id or value is not valid.");
  }
  if (hasName(error, "ValidationError") && !(error instanceof EnvError)) {
    return jsonError(400, "validation_failed", "Some fields are invalid.", mongooseIssues(error));
  }
  if (isDuplicateKeyError(error)) {
    return jsonError(409, "conflict", "That already exists.");
  }
  if (hasName(error, "ExternalFetchError")) {
    console.error("[api] upstream failure:", error);
    return jsonError(503, "unavailable", "A campus data source is not responding. Try again soon.");
  }
  console.error(
    error instanceof EnvError
      ? "[api] server configuration error:"
      : error instanceof z.ZodError
        ? "[api] data failed validation on the server:"
        : "[api] unhandled error:",
    error,
  );
  return jsonError(500, "internal", "Something went wrong. Please try again.");
}
