import { NextResponse, type NextRequest } from "next/server";
import { RETURN_PATH_HEADER, returnPathOf } from "@/lib/routes";

/**
 * Request proxy (Next.js 16's renamed middleware). Main job: tell server components which page was requested.
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
 *
 * Two guards ride along:
 * - A page request whose Next-Router-State-Tree header is not URI-encoded JSON (any scanner can send one) is
 *   answered 400 here: Next.js 16 would fail it with a 500 and three error lines per request.
 * - GET /api/auth/test-mailbox (the e2e mailer hook, the one /api path the proxy sees) is served only in the test
 *   setup; on every Vercel deployment and outside fixtures mode it is rewritten to a path no route matches, so the
 *   answer is the app's own not-found page, the same as for any missing URL. The route re-checks the full rule.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === TEST_MAILBOX_PATH) {
    return testMailboxRuledOut()
      ? NextResponse.rewrite(new URL(MISSING_PATH, request.url))
      : NextResponse.next();
  }
  const routerState = request.headers.get(ROUTER_STATE_HEADER);
  if (routerState !== null && !isRouterStateHeader(routerState)) {
    return new NextResponse("Bad request", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, returnPathOf(request.nextUrl));
  return NextResponse.next({ request: { headers } });
}

/** The e2e mailer hook (app/api/auth/test-mailbox/route.ts). */
export const TEST_MAILBOX_PATH = "/api/auth/test-mailbox";
/** A path no route matches (`_` folders are never routes): rewritten to, it renders the app's not-found page. */
export const MISSING_PATH = "/_missing";

/** On a Vercel deployment, or not in fixtures mode: the mailbox hook cannot exist (server/env.ts rules). */
function testMailboxRuledOut(): boolean {
  return (
    Boolean(process.env.VERCEL_ENV?.trim()) || process.env.EXTERNAL_MODE?.trim() !== "fixtures"
  );
}

/** The router state Next.js reads on RSC requests (parseAndValidateFlightRouterState). */
export const ROUTER_STATE_HEADER = "next-router-state-tree";
/** Next.js refuses a longer router state header (with a 500). */
export const ROUTER_STATE_MAX_LENGTH = 40_000;

/**
 * Whether a Next-Router-State-Tree value can be the router state Next.js expects: at most its size limit, and
 * URI-encoded JSON of an array (the state is a tuple). Next.js still checks the tuple's shape itself.
 */
export function isRouterStateHeader(value: string): boolean {
  if (value.length > ROUTER_STATE_MAX_LENGTH) return false;
  try {
    return Array.isArray(JSON.parse(decodeURIComponent(value)));
  } catch {
    return false;
  }
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$|icon\\.svg$).*)",
    "/api/auth/test-mailbox",
  ],
};
