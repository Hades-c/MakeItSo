import { GENERIC_ERROR, NETWORK_ERROR } from "@/app/(auth)/_lib/messages";
import { ApiClientError } from "@/lib/api/client";
import type { ApiIssue } from "@/lib/api/errors";

/**
 * What a profile form shows for a failed callApi(). Field issues go to their fields; everything else becomes one
 * sentence: the server's own message for the codes that carry a useful one (rate limits, conflicts, 503s), and
 * fixed wording for the rest, so nothing unexpected from the network is ever shown.
 */

export interface FailureView {
  message: string | null;
  issues: ApiIssue[];
  /** 401: the session ended (password changed elsewhere, signed out everywhere). */
  signedOut: boolean;
}

const SESSION_ENDED = "Your session has ended. Sign in again to continue.";

export function describeFailure(caught: unknown): FailureView {
  if (!(caught instanceof ApiClientError)) {
    return { message: NETWORK_ERROR, issues: [], signedOut: false };
  }
  if (caught.status === 401) return { message: SESSION_ENDED, issues: [], signedOut: true };
  const issues = caught.issues ?? [];
  switch (caught.code) {
    case "network":
      return { message: NETWORK_ERROR, issues: [], signedOut: false };
    case "validation_failed":
    case "bad_request":
      return {
        message: issues.length > 0 ? null : caught.message || GENERIC_ERROR,
        issues,
        signedOut: false,
      };
    case "rate_limited":
    case "conflict":
    case "unavailable":
    case "forbidden":
    case "not_found":
      return { message: caught.message || GENERIC_ERROR, issues: [], signedOut: false };
    default:
      return { message: GENERIC_ERROR, issues: [], signedOut: false };
  }
}
