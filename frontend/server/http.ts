import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Typed JSON errors for route handlers. Every error response has the shape
 *   { "error": { "code": "...", "message": "...", "issues"?: [{ "path": "...", "message": "..." }] } }
 */

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "internal";

export interface ApiIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; issues?: ApiIssue[] };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiIssue[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  issues?: ApiIssue[],
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, ...(issues ? { issues } : {}) } }, { status });
}

function zodIssues(error: z.ZodError): ApiIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/** Convert anything thrown by a handler into a typed JSON error response (500s are logged, never leaked). */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.code, error.message, error.issues);
  }
  if (error instanceof z.ZodError) {
    return jsonError(400, "validation_failed", "Some fields are invalid.", zodIssues(error));
  }
  console.error("[api] unhandled error:", error);
  return jsonError(500, "internal", "Something went wrong. Please try again.");
}

/**
 * Wrap a route handler so thrown ApiError/ZodError values become typed JSON responses.
 * Next.js control-flow errors (redirect(), notFound(), dynamic-usage bailouts) are re-thrown untouched.
 */
export function withApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      unstable_rethrow(error);
      return toErrorResponse(error);
    }
  };
}

/** Parse and validate a JSON request body. Throws ApiError(400) for malformed JSON, ZodError for bad fields. */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "bad_request", "Request body must be valid JSON.");
  }
  return schema.parse(body);
}
