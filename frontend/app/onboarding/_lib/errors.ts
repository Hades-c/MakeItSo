import { ApiClientError } from "@/lib/api/client";
import type { ApiIssue } from "@/lib/api/errors";

/**
 * What a step shows for a failed callApi(): field issues for the form, otherwise one sentence. The server's own
 * message is shown only for the codes whose messages are written for students (validation, conflicts, rate limits,
 * 503s); anything else gets fixed wording, so nothing unexpected from the network is ever displayed.
 */

export const NETWORK_ERROR = "Could not reach MakeItSo. Check your connection and try again.";
export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const SESSION_ENDED = "Your session has ended. Sign in again to continue.";

export interface Failure {
  message: string;
  issues: ApiIssue[];
  /** 409: the plan already holds this course (a re-run, another tab): reload instead of retrying. */
  conflict: boolean;
  signedOut: boolean;
}

export function describeFailure(caught: unknown): Failure {
  const base = { issues: [] as ApiIssue[], conflict: false, signedOut: false };
  if (!(caught instanceof ApiClientError)) return { ...base, message: NETWORK_ERROR };
  if (caught.status === 401) return { ...base, message: SESSION_ENDED, signedOut: true };
  switch (caught.code) {
    case "network":
      return { ...base, message: NETWORK_ERROR };
    case "validation_failed":
    case "bad_request":
      return {
        ...base,
        message: caught.issues?.[0]?.message ?? (caught.message || GENERIC_ERROR),
        issues: caught.issues ?? [],
      };
    case "conflict":
      return { ...base, message: caught.message || GENERIC_ERROR, conflict: true };
    case "rate_limited":
    case "unavailable":
    case "not_found":
    case "forbidden":
      return { ...base, message: caught.message || GENERIC_ERROR };
    default:
      return { ...base, message: GENERIC_ERROR };
  }
}

/** The first issue message for a field ("majors.1" belongs to "majors"). */
export function issueFor(issues: readonly ApiIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.path === field || issue.path.startsWith(`${field}.`))
    ?.message;
}
