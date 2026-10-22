import { INVALID_CREDENTIALS } from "./messages";

/**
 * Sign-in refusals travel from the server (server/auth/options.ts SignInRefusedError) to the login form as
 * NextAuth's `error` value, either in signIn()'s result or as `/login?error=` after a non-JS sign-in. That value
 * is attacker-controllable in a link, so it is never shown as it is: the server sends a fixed code plus an
 * optional number of seconds ("TooManyAttempts:120"), and signInErrorMessage() builds the whole sentence here.
 * Anything that does not match a code exactly (for example a crafted `/login?error=...` link) gets a generic
 * message, so the page can never be made to display arbitrary text.
 */

export const SIGN_IN_REFUSALS = {
  /** 10 failed sign-ins in 15 minutes from this client IP. */
  "ip-limit": "TooManyAttempts",
  /** This address is backed off for this client IP (or, past the address ceiling, for new IPs). */
  backoff: "AddressBackoff",
  /** The database or configuration failed; details are only in the server log. */
  unavailable: "SignInUnavailable",
} as const;
export type SignInRefusal = keyof typeof SIGN_IN_REFUSALS;

/** Longest wait a code may carry (the longest real one is 15 minutes). */
const MAX_WAIT_SEC = 3600;

/** The NextAuth error value for a refusal: "TooManyAttempts:120", "SignInUnavailable". */
export function signInRefusalCode(kind: SignInRefusal, retryAfterSec?: number): string {
  const code = SIGN_IN_REFUSALS[kind];
  if (retryAfterSec === undefined) return code;
  const seconds = Math.min(MAX_WAIT_SEC, Math.max(1, Math.ceil(retryAfterSec)));
  return `${code}:${seconds}`;
}

/** "5 minutes" / "1 minute" / "30 seconds" for messages. */
export function describeWait(seconds: number): string {
  if (seconds < 60) {
    const s = Math.max(1, Math.ceil(seconds));
    return `${s} second${s === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export const SIGN_IN_UNAVAILABLE_MESSAGE =
  "Sign-in is temporarily unavailable. Please try again in a moment.";
export const SIGN_IN_FAILED_MESSAGE = "Sign-in failed. Please try again.";

const REFUSAL_PATTERN = /^(TooManyAttempts|AddressBackoff)(?::([1-9]\d{0,3}))?$/;

/** The login page's text for a NextAuth error value (see the module comment); null when there is none. */
export function signInErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error === "CredentialsSignin") return INVALID_CREDENTIALS;
  if (error === "SessionRequired") return "Sign in to continue.";
  if (error === SIGN_IN_REFUSALS.unavailable) return SIGN_IN_UNAVAILABLE_MESSAGE;
  const match = REFUSAL_PATTERN.exec(error);
  if (!match) return SIGN_IN_FAILED_MESSAGE;
  const seconds = match[2] ? Number(match[2]) : null;
  const wait =
    seconds !== null && seconds <= MAX_WAIT_SEC
      ? `Wait ${describeWait(seconds)} and try again.`
      : "Wait a few minutes and try again.";
  return match[1] === SIGN_IN_REFUSALS["ip-limit"]
    ? `Too many sign-in attempts. ${wait}`
    : `Too many failed sign-in attempts for this address. ${wait}`;
}
