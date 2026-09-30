import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getAuthOptions } from "@/server/auth/options";
import { ApiError } from "@/server/http";

/** The signed-in user as the rest of the server sees it. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/**
 * The current user, or null when signed out (or when the session predates the `id` claim).
 * Memoised per request with React cache(), so a layout and its page share one session lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Session-dependent output is per request: opt out of prerendering before touching the auth config, so
  // `next build` never evaluates (or needs) NEXTAUTH_SECRET.
  await connection();
  const session = await getServerSession(getAuthOptions());
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name ?? "" };
});

/**
 * For server components, layouts and server actions: returns the signed-in user or redirects to /login.
 * Route handlers should use requireApiUser() instead, which answers 401 rather than redirecting.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For route handlers wrapped in withApi(): returns the signed-in user or throws ApiError(401), which withApi()
 * turns into `{ error: { code: "unauthorized", ... } }` with status 401.
 */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return user;
}
