import { ApiClientError } from "@/lib/api/client";

/**
 * What a failed plan request means for the student, in one sentence (isomorphic). A 409 is the duplicate key
 * (same course, same term); 401 is an ended session; a validation failure carries the server's own words and the
 * first per-field issue (e.g. "CRN 20135 is not a Spring 2027 section.").
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.code === "unauthorized") {
      return "Your session has ended. Sign in again to keep planning.";
    }
    if (error.code === "network") return error.message;
    if (error.code === "rate_limited")
      return "Too many changes at once. Wait a moment and try again.";
    if (error.status === 503 || error.code === "unavailable") {
      return "The course schedule is not reachable right now. Try again in a minute.";
    }
    if (
      error.code === "validation_failed" ||
      error.code === "bad_request" ||
      error.code === "conflict" ||
      error.code === "not_found"
    ) {
      const issue = error.issues?.find((candidate) => candidate.message)?.message;
      return issue && issue !== error.message ? `${error.message} ${issue}` : error.message;
    }
  }
  return fallback;
}

/** True for the duplicate-key answer (the course is already active in that term). */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiClientError && (error.status === 409 || error.code === "conflict");
}
