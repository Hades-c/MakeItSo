import { INVALID_CREDENTIALS } from "./messages";

/**
 * The login page's error text for a NextAuth error code. Only known codes and our own server messages are shown
 * verbatim; anything else (for example a crafted `/login?error=...` link) gets a generic message, so the page
 * can never be made to display arbitrary text.
 */
export function signInErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error === "CredentialsSignin") return INVALID_CREDENTIALS;
  if (error === "SessionRequired") return "Sign in to continue.";
  if (/^Too many (failed )?sign-in attempts/.test(error)) return error;
  if (error.startsWith("Sign-in is temporarily unavailable")) return error;
  return "Sign-in failed. Please try again.";
}
