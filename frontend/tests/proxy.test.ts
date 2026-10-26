import { readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import { RETURN_PATH_HEADER, returnPathOf } from "@/lib/routes";
import {
  config,
  isRouterStateHeader,
  MISSING_PATH,
  proxy,
  ROUTER_STATE_HEADER,
  ROUTER_STATE_MAX_LENGTH,
  TEST_MAILBOX_PATH,
} from "@/proxy";

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

describe("the Next-Router-State-Tree guard", () => {
  const withTree = (value: string) =>
    proxy(
      new NextRequest("http://localhost:3000/register?_rsc=abc", {
        headers: { rsc: "1", [ROUTER_STATE_HEADER]: value },
      }),
    );

  it("answers 400 to a value that is not URI-encoded JSON (Next.js would 500 and log)", async () => {
    for (const value of ["%%%", "notjson", "%7B", "[1,2", '{"a":1}', "%22text%22", "1"]) {
      const response = withTree(value);
      expect([value, response.status]).toEqual([value, 400]);
      expect(await response.text()).toBe("Bad request");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    // Two headers arrive joined with ", ": never one router state.
    const tree = encodeURIComponent(JSON.stringify(["", {}]));
    expect(withTree(`${tree}, ${tree}`).status).toBe(400);
    // Over Next.js's own size limit.
    expect(isRouterStateHeader(`%5B${"0,".repeat(ROUTER_STATE_MAX_LENGTH)}0%5D`)).toBe(false);
  });

  it("lets a real router state (and a request without one) through to the page", () => {
    // What the router sends when it navigates to /register (Next.js answers it 200).
    const tree = encodeURIComponent(
      JSON.stringify(["", { children: ["register", { children: ["__PAGE__", {}] }] }, null, null]),
    );
    expect(isRouterStateHeader(tree)).toBe(true);
    const response = withTree(tree);
    expect(response.status).toBe(200);
    expect(forwardedHeader(response, RETURN_PATH_HEADER)).toBe("/register");
    expect(proxy(new NextRequest("http://localhost:3000/register")).status).toBe(200);
  });
});

describe("GET /api/auth/test-mailbox outside the test setup", () => {
  const request = () =>
    new NextRequest("http://localhost:3000/api/auth/test-mailbox?email=not-an-email");
  const rewrittenTo = (response: Response) => response.headers.get("x-middleware-rewrite");

  it("is the one /api path the proxy sees", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: TEST_MAILBOX_PATH })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: `${TEST_MAILBOX_PATH}?email=x` })).toBe(
      true,
    );
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/auth/password-reset" })).toBe(false);
  });

  it("is rewritten to the app's not-found page on Vercel or outside fixtures mode, before the query is read", () => {
    vi.stubEnv("EXTERNAL_MODE", "live");
    expect(rewrittenTo(proxy(request()))).toBe(`http://localhost:3000${MISSING_PATH}`);
    vi.stubEnv("EXTERNAL_MODE", "fixtures");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(rewrittenTo(proxy(request()))).toBe(`http://localhost:3000${MISSING_PATH}`);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(rewrittenTo(proxy(request()))).toBe(`http://localhost:3000${MISSING_PATH}`);
  });

  it("reaches the route in the test setup (the route checks the mailer itself)", () => {
    vi.stubEnv("EXTERNAL_MODE", "fixtures");
    vi.stubEnv("VERCEL_ENV", "");
    const response = proxy(request());
    expect(rewrittenTo(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
