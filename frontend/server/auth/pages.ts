import "server-only";
import { unstable_rethrow } from "next/navigation";
import { safeCallbackPath } from "@/lib/routes";
import { appOriginForEmail } from "@/server/auth/emails";
import { getSessionUser, type SessionUser } from "@/server/auth/session";

/** Helpers for the auth pages (app/(auth)/**): server components only. */

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A same-origin path to continue to (lib/routes safeCallbackPath); /today otherwise. */
export function callbackPathFrom(value: string | string[] | undefined): string {
  return safeCallbackPath(firstParam(value), appOriginForEmail() ?? "http://localhost");
}

/**
 * The signed-in user, or null — also when the session cannot be checked (database down): the sign-in pages must
 * still render. Next.js control flow (the dynamic-rendering bailout) is re-thrown.
 */
export async function signedInUserOrNull(): Promise<SessionUser | null> {
  try {
    return await getSessionUser();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] could not check the session:", error);
    return null;
  }
}
