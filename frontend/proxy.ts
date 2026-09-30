import { NextResponse, type NextRequest } from "next/server";
import { RETURN_PATH_HEADER, returnPathOf } from "@/lib/routes";

/**
 * Request proxy (Next.js 16's renamed middleware). One job: tell server components which page was requested.
 * Layouts cannot see the URL, so requireUser() in app/(hub)/layout.tsx reads RETURN_PATH_HEADER to send a
 * signed-out deep link to /login?callbackUrl=<path> (and an unverified account to /verify?next=<path>).
 *
 * - The header is always SET, never appended, so a value the client sent is overwritten.
 * - The value is the path + query as requested, minus Next.js's internal `_rsc` cache-busting parameter. It is
 *   still untrusted input: server/auth re-checks it with safeAppPath before any redirect uses it.
 * - Page routes only (see `config.matcher`): not /api, not /_next, not files (anything with a dot).
 * - No auth, no database, no network: it runs on every page request.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, returnPathOf(request.nextUrl));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
