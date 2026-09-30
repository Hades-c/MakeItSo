import "server-only";
import { readEnv } from "@/server/env";
import { ApiError } from "@/server/http/errors";

/**
 * Cross-site request protection for state-changing requests (PLAN §4.1.9). A non-GET request is accepted only when
 *   - its Origin header is one of the app's origins, or
 *   - it has no Origin header and `Sec-Fetch-Site: same-origin`.
 * Browsers always send one of the two on fetch/form POSTs, so a request with neither (curl, scripts) is rejected
 * too: they can still use GET routes. NextAuth's own routes are not built with defineRoute and keep its CSRF token.
 *
 * The app's origins:
 *   1. APP_ORIGIN (required in production), else the NEXTAUTH_URL origin;
 *   2. on Vercel preview deployments, https://$VERCEL_URL and https://$VERCEL_BRANCH_URL;
 *   3. in development and tests, the request's own origin (so localhost / 127.0.0.1 both work).
 */
export function appOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  const appOrigin = readEnv("APP_ORIGIN");
  if (appOrigin) {
    origins.add(appOrigin);
  } else {
    const nextAuthUrl = readEnv("NEXTAUTH_URL");
    if (nextAuthUrl) origins.add(new URL(nextAuthUrl).origin);
  }
  if (readEnv("VERCEL_ENV") === "preview") {
    for (const host of [readEnv("VERCEL_URL"), readEnv("VERCEL_BRANCH_URL")]) {
      if (host) origins.add(`https://${host}`);
    }
  }
  if (readEnv("NODE_ENV") !== "production") origins.add(new URL(request.url).origin);
  return origins;
}

/** Throws ApiError(403) unless the request comes from the app itself (see appOrigins). */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    if (origin !== "null" && appOrigins(request).has(origin)) return;
    throw new ApiError(403, "forbidden", "Cross-site requests are not allowed.");
  }
  if (request.headers.get("sec-fetch-site") === "same-origin") return;
  throw new ApiError(403, "forbidden", "Cross-site requests are not allowed.");
}
