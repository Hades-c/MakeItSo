import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getSessionUser } from "@/server/auth";

/**
 * Whether the landing's visitor is signed in, for the header and hero buttons only. The landing never waits on it:
 * the buttons that depend on it render inside Suspense boundaries whose fallback is the signed-out buttons, and the
 * check itself gives up after SESSION_CHECK_TIMEOUT_MS (a session claim is checked against MongoDB, whose server
 * selection alone can take 5 s while it is unreachable). Any failure or timeout counts as signed out: the signed-out
 * page is right for everyone, and /login sends a signed-in student on to Today.
 */

export const SESSION_CHECK_TIMEOUT_MS = 1_500;

class SessionCheckTimeout extends Error {}

async function checkSession(timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SessionCheckTimeout()), timeoutMs);
  });
  try {
    return (await Promise.race([getSessionUser(), timeout])) !== null;
  } catch (error) {
    if (error instanceof SessionCheckTimeout) return false;
    // Next.js control flow (dynamic rendering, redirects) must pass through.
    unstable_rethrow(error);
    console.error("[landing] could not read the session:", error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Once per request (the header and the hero share it). */
export const isSignedIn = cache((timeoutMs: number = SESSION_CHECK_TIMEOUT_MS): Promise<boolean> =>
  checkSession(timeoutMs),
);
