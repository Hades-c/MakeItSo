import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { RETURN_PATH_HEADER, returnPathOf } from "@/lib/routes";
import { config, proxy } from "@/proxy";

/** The request headers NextResponse.next({ request: { headers } }) hands to the page. */
function forwardedHeader(response: Response, name: string): string | null {
  const overridden = (response.headers.get("x-middleware-override-headers") ?? "").split(",");
  if (!overridden.includes(name)) return null;
  return response.headers.get(`x-middleware-request-${name}`);
}

describe("request proxy (frontend/proxy.ts)", () => {
  it("tells server components the requested path + query", () => {
    const response = proxy(new NextRequest("http://localhost:3000/plan?tab=four-year&term=202602"));
    expect(forwardedHeader(response, RETURN_PATH_HEADER)).toBe("/plan?tab=four-year&term=202602");
    const plain = proxy(new NextRequest("http://localhost:3000/courses/202602/CSC-221"));
    expect(forwardedHeader(plain, RETURN_PATH_HEADER)).toBe("/courses/202602/CSC-221");
  });

  it("overwrites a value the client sent (set, never append)", () => {
    const request = new NextRequest("http://localhost:3000/alumni", {
      headers: { [RETURN_PATH_HEADER]: "//evil.example/phish" },
    });
    expect(forwardedHeader(proxy(request), RETURN_PATH_HEADER)).toBe("/alumni");
  });

  it("drops Next's internal _rsc parameter and keeps everything else", () => {
    expect(returnPathOf(new URL("http://x/plan?_rsc=abc123&tab=next"))).toBe("/plan?tab=next");
    expect(returnPathOf(new URL("http://x/today?_rsc=1"))).toBe("/today");
    expect(returnPathOf(new URL("http://x/courses?q=data%20science&dept=CSC"))).toBe(
      "/courses?q=data+science&dept=CSC",
    );
  });

  it("runs on page routes only: never on /api, /_next or files", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    for (const page of ["/", "/today", "/plan?tab=next", "/courses/202602/CSC-221", "/login"]) {
      expect([page, matches(page)]).toEqual([page, true]);
    }
    for (const other of [
      "/api/search?q=x",
      "/api/auth/session",
      "/_next/static/chunks/app.js",
      "/_next/image?url=x",
      "/favicon.ico",
      "/icon.svg",
      "/robots.txt",
    ]) {
      expect([other, matches(other)]).toEqual([other, false]);
    }
  });
});
