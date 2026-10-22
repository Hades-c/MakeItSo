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
 * - It runs on every request that can render a page, dots in the path included (/careers/x.y and
 *   /courses/202602/CSC-221.json reach the hub layout like any other page path). `config.matcher` skips only what
 *   never renders a layout: /api (route handlers), /_next (build assets; `_` folders are never routes) and the real
 *   files in public/ plus favicon.ico. A new public/ file may join that list; the proxy is harmless on it anyway.
 * - No auth, no database, no network, so running on every page request costs next to nothing.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, returnPathOf(request.nextUrl));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$|icon\\.svg$).*)"],
};
