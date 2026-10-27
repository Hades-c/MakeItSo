import { ApiClientError } from "@/lib/api/client";

/** What a failed syllabus request means for the student, in one sentence (isomorphic). */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.code === "unauthorized") {
      return "Your session has ended. Sign in again to continue.";
    }
    if (error.code === "network") return error.message;
    if (error.code === "rate_limited")
      return "Too many requests at once. Wait a moment and try again.";
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
