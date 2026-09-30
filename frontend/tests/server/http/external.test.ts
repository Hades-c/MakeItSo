import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resetEnvCache } from "@/server/env";
import {
  EXTERNAL_HOSTS,
  EXTERNAL_USER_AGENT,
  ExternalFetchError,
  fetchExternal,
} from "@/server/http/external";
import { MissingFixtureError, resetFixtureCache } from "@/server/http/fixtures";

afterEach(() => {
  resetEnvCache();
  resetFixtureCache();
  vi.unstubAllGlobals();
});

describe("fetchExternal in fixtures mode (the test default)", () => {
  it("serves the recorded Davidson API responses without the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await fetchExternal(
      "course-schedule",
      "https://api.davidson.edu/api/public/v2/courses?term_code=202601&offset=0&limit=1000",
    );
    expect(res.fromFixture).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(676);
    expect(fetchSpy).not.toHaveBeenCalled();

    const summer = await fetchExternal(
      "course-schedule",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202503",
    );
    expect(summer.data).toEqual([]);
    const secondPage = await fetchExternal(
      "course-schedule",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=1000&term_code=202602",
    );
    expect(secondPage.data).toEqual([]);
  });

  it("validates with a schema and returns text for feeds", async () => {
    const terms = await fetchExternal(
      "course-schedule",
      "https://api.davidson.edu/api/public/v2/terms?limit=500",
      { schema: z.array(z.object({ term_code: z.string(), is_active: z.boolean() })) },
    );
    expect(terms.data.find((t) => t.is_active)?.term_code).toBe("202601");

    const ics = await fetchExternal("wildcatsync", "https://wildcatsync.davidson.edu/events.ics", {
      parse: "text",
    });
    expect(ics.data.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.headers.get("content-type")).toMatch(/text\/calendar/);
  });

  it("answers the RMP GraphQL POST only for the Davidson school id", async () => {
    const query = {
      query: "query { newSearch { teachers { edges { node { id } } } } }",
      variables: { schoolID: "U2Nob29sLTM5NjU=" },
    };
    const res = await fetchExternal(
      "ratemyprofessors",
      "https://www.ratemyprofessors.com/graphql",
      {
        method: "POST",
        body: query,
      },
    );
    expect(res.data).toMatchObject({
      data: { newSearch: { teachers: { edges: expect.any(Array) } } },
    });
    await expect(
      fetchExternal("ratemyprofessors", "https://www.ratemyprofessors.com/graphql", {
        method: "POST",
        body: { variables: { schoolID: "U2Nob29sLTk5OTk5" } },
      }),
    ).rejects.toBeInstanceOf(MissingFixtureError);
  });

  it("fails loudly for a URL no fixture covers", async () => {
    const error = await fetchExternal(
      "course-schedule",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202001",
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingFixtureError);
    expect(error).not.toBeInstanceOf(ExternalFetchError);
    expect((error as Error).message).toMatch(/course-schedule\/manifest\.json/);
  });

  it("blocks hosts outside the source's allow-list and non-https URLs, in every mode", async () => {
    for (const url of [
      "https://evil.example/api/public/v2/terms",
      "http://api.davidson.edu/api/public/v2/terms",
      "https://wildcatsync.davidson.edu/events.ics",
      "not a url",
    ]) {
      await expect(fetchExternal("course-schedule", url)).rejects.toMatchObject({
        name: "ExternalFetchError",
        kind: "blocked",
      });
    }
    expect(Object.keys(EXTERNAL_HOSTS).sort()).toEqual(
      [
        "catalog",
        "course-schedule",
        "davidson-news",
        "davidsonian",
        "events-digest",
        "hurt-hub",
        "library",
        "ratemyprofessors",
        "wildcatsync",
      ].sort(),
    );
  });
});

describe("fetchExternal with custom fixtures (status, parse and schema failures)", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), "mis-fixtures-"));
    const dir = path.join(cwd, "tests", "fixtures", "external", "davidsonian");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "down.html"), "<html>WAF challenge</html>");
    writeFileSync(path.join(dir, "ok.json"), '{"items": [1, 2]}');
    writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        source: "davidsonian",
        description: "test",
        routes: [
          { url: "https://thedavidsonian.news/down", file: "down.html", status: 503 },
          { url: "https://thedavidsonian.news/challenge", file: "down.html", status: 202 },
          { url: "https://thedavidsonian.news/ok?page=*", file: "ok.json" },
        ],
      }),
    );
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("reports non-2xx, non-JSON and schema mismatches as typed failures", async () => {
    await expect(
      fetchExternal("davidsonian", "https://thedavidsonian.news/down"),
    ).rejects.toMatchObject({
      kind: "http",
      status: 503,
    });
    await expect(
      fetchExternal("davidsonian", "https://thedavidsonian.news/challenge"),
    ).rejects.toMatchObject({
      kind: "parse",
      status: 202,
    });
    await expect(
      fetchExternal("davidsonian", "https://thedavidsonian.news/ok?page=2", {
        schema: z.object({ items: z.array(z.string()) }),
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    const ok = await fetchExternal("davidsonian", "https://thedavidsonian.news/ok?page=7");
    expect(ok.data).toEqual({ items: [1, 2] });
    // "*" needs the parameter to be present; extra parameters do not match.
    await expect(
      fetchExternal("davidsonian", "https://thedavidsonian.news/ok"),
    ).rejects.toBeInstanceOf(MissingFixtureError);
    await expect(
      fetchExternal("davidsonian", "https://thedavidsonian.news/ok?page=1&x=2"),
    ).rejects.toBeInstanceOf(MissingFixtureError);
  });
});

describe("fetchExternal in live mode (fetch stubbed: no network)", () => {
  beforeEach(() => {
    vi.stubEnv("EXTERNAL_MODE", "live");
  });

  it("sends a MakeItSo User-Agent, custom headers and JSON bodies", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchExternal(
      "ratemyprofessors",
      "https://www.ratemyprofessors.com/graphql",
      {
        method: "POST",
        body: { query: "{}" },
        headers: { "x-test": "1" },
      },
    );
    expect(res.fromFixture).toBe(false);
    expect(res.data).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("user-agent")).toBe(EXTERNAL_USER_AGENT);
    expect(headers.get("x-test")).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init?.body).toBe('{"query":"{}"}');
    expect(init?.redirect).toBe("manual");
  });

  it("times out (default 8 s; here 20 ms)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    );
    await expect(
      fetchExternal("library", "https://davidson.libcal.com/x", { timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("classifies network errors, HTTP errors and oversized bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    await expect(fetchExternal("library", "https://davidson.libcal.com/x")).rejects.toMatchObject({
      kind: "network",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(fetchExternal("library", "https://davidson.libcal.com/x")).rejects.toMatchObject({
      kind: "http",
      status: 404,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(2000))),
    );
    await expect(
      fetchExternal("library", "https://davidson.libcal.com/x", { parse: "text", maxBytes: 1000 }),
    ).rejects.toMatchObject({ kind: "too_large" });
  });

  it("follows redirects only within the source's hosts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "/feed/?paged=1" } }),
      )
      .mockResolvedValueOnce(new Response("<rss/>"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchExternal("davidsonian", "https://thedavidsonian.news/feed", {
      parse: "text",
    });
    expect(res.url).toBe("https://thedavidsonian.news/feed/?paged=1");
    expect(res.data).toBe("<rss/>");

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
      ),
    );
    await expect(
      fetchExternal("davidsonian", "https://thedavidsonian.news/feed", { parse: "text" }),
    ).rejects.toMatchObject({ kind: "blocked" });
  });
});
