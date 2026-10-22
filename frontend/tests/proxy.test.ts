import { readdirSync } from "node:fs";
import path from "node:path";
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

  it("runs on every page path, dots included; never on /api, /_next or the public files", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    for (const page of [
      "/",
      "/today",
      "/plan?tab=next",
      "/courses/202602/CSC-221",
      "/login",
      // Dotted page paths still render the hub layout, so the proxy must overwrite the header there too.
      "/careers/x.y",
      "/courses/202602/CSC-221.json",
      "/careers/software-engineering.html?tab=a.b",
      "/apiary",
      "/robots.txt",
    ]) {
      expect([page, matches(page)]).toEqual([page, true]);
    }
    for (const other of [
      "/api",
      "/api/search?q=x",
      "/api/auth/session",
      "/_next/static/chunks/app.js",
      "/_next/image?url=x",
      "/favicon.ico",
      "/icon.svg",
    ]) {
      expect([other, matches(other)]).toEqual([other, false]);
    }
  });

  it("covers every page route in app/, whatever its dynamic segments hold", () => {
    const appDir = path.join(process.cwd(), "app");
    const pages = readdirSync(appDir, { recursive: true, encoding: "utf8" })
      .filter((file) => /(^|[/\\])page\.tsx$/.test(file))
      .map((file) => {
        const segments = path
          .dirname(file)
          .split(/[/\\]/)
          .filter((segment) => segment !== "." && !/^\(.*\)$/.test(segment))
          .map((segment) => (segment.startsWith("[") ? "x.y" : segment));
        return `/${segments.join("/")}`;
      });
    expect(pages).toEqual(
      expect.arrayContaining(["/", "/today", "/careers/x.y", "/courses/x.y/x.y"]),
    );
    for (const page of pages) {
      expect([page, unstable_doesMiddlewareMatch({ config, url: page })]).toEqual([page, true]);
    }
  });

  it("skips the files in public/ (a new one joins the matcher's list)", () => {
    for (const file of readdirSync(path.join(process.cwd(), "public"))) {
      const url = `/${file}`;
      expect([url, unstable_doesMiddlewareMatch({ config, url })]).toEqual([url, false]);
    }
  });
});
