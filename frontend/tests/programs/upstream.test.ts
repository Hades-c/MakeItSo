import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExternalFetchError, fetchExternal, MissingFixtureError } from "@/server/http";
import {
  MIN_PROGRAM_COUNT,
  programDetailUrl,
  programListUrl,
  programPublicUrl,
} from "@/server/programs/catalog-info";
import {
  AcalogProgramListSchema,
  type CatalogFetcher,
  fetchCatalog,
  fetchProgramDetail,
  fetchProgramList,
  isInterdisciplinaryMinorType,
  isPublicProgram,
  jsonDepth,
  MAX_JSON_DEPTH,
} from "@/server/programs/upstream";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "external", "catalog");
const read = (file: string) => readFileSync(path.join(FIXTURES, file), "utf8");
const LIST = JSON.parse(read("programs.json")) as {
  count: number;
  "program-list": Record<string, unknown>[];
};

function respond(
  status: number,
  text: string,
  headers: Record<string, string> = {},
): CatalogFetcher {
  return async () => ({ status, text, headers: new Headers(headers) });
}

function listOf(items: Record<string, unknown>[], count = items.length) {
  return JSON.stringify({ count, "program-list": items });
}

describe("Acalog URLs", () => {
  it("reads the whole list with page-size=100, and program pages by id", () => {
    expect(programListUrl()).toBe(
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page-size=100",
    );
    expect(programListUrl(2)).toBe(
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page=2&page-size=100",
    );
    expect(programDetailUrl(172)).toBe(
      "https://catalog.davidson.edu/widget-api/catalog/4/program/172",
    );
    expect(programPublicUrl(1799)).toBe(
      "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1799",
    );
    expect(programPublicUrl(null)).toBe(
      "https://catalog.davidson.edu/content.php?catoid=28&navoid=1340",
    );
  });
});

describe("fetchProgramList", () => {
  it("reads the recorded 2026-2027 list completely (52 programs, 51 public)", async () => {
    const result = await fetchProgramList(fetchCatalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(52);
    expect(result.data.filter(isPublicProgram)).toHaveLength(51);
    // Film and Media Studies (178) is in the list but hidden from the public catalog.
    expect(result.data.find((item) => item.id === 178)?.status.visible).toBe(false);
  });

  it("matches the default paged list (20 per page, pages 1-3) program for program", async () => {
    const pages = await Promise.all(
      [1, 2, 3].map(async (page) => {
        const res = await fetchExternal(
          "catalog",
          `https://catalog.davidson.edu/widget-api/catalog/4/programs?page=${page}`,
        );
        return AcalogProgramListSchema.parse(res.data)["program-list"];
      }),
    );
    expect(pages.map((page) => page.length)).toEqual([20, 20, 12]);
    const full = await fetchProgramList(fetchCatalog);
    expect(full.ok && full.data.map((item) => item.id)).toEqual(
      pages.flat().map((item) => item.id),
    );
  });

  it("rejects a WAF bot challenge (202, or any response with x-amzn-waf-action)", async () => {
    expect(await fetchProgramList(respond(202, "", { "x-amzn-waf-action": "challenge" }))).toEqual({
      ok: false,
      error: "Acalog answered 202 with a bot challenge (x-amzn-waf-action: challenge)",
    });
    expect(await fetchProgramList(respond(202, read("programs.json")))).toMatchObject({
      ok: false,
    });
    expect(
      await fetchProgramList(
        respond(200, read("programs.json"), { "x-amzn-waf-action": "captcha" }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining("bot challenge") });
  });

  it("rejects non-2xx answers, timeouts and network errors", async () => {
    const url = programListUrl();
    const failing =
      (kind: "http" | "timeout" | "network", status?: number): CatalogFetcher =>
      async () => {
        throw new ExternalFetchError("catalog", url, kind, "failed", status);
      };
    expect(await fetchProgramList(failing("http", 503))).toEqual({
      ok: false,
      error: "Acalog answered 503",
    });
    expect(await fetchProgramList(failing("timeout"))).toEqual({
      ok: false,
      error: "Acalog timed out",
    });
    expect(await fetchProgramList(failing("network"))).toEqual({
      ok: false,
      error: "Acalog could not be reached",
    });
    expect(await fetchProgramList(respond(304, ""))).toEqual({
      ok: false,
      error: "Acalog answered 304",
    });
  });

  it("rejects empty, non-JSON and wrongly shaped bodies", async () => {
    expect(await fetchProgramList(respond(200, "  \n"))).toEqual({
      ok: false,
      error: "Acalog sent an empty response",
    });
    expect(await fetchProgramList(respond(200, "<html>Maintenance</html>"))).toEqual({
      ok: false,
      error: "Acalog sent a response that is not JSON",
    });
    expect(await fetchProgramList(respond(200, '{"programs": []}'))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^Acalog response has an unexpected shape at count/),
    });
    const otherCatalog = LIST["program-list"].map((item) => ({ ...item, "catalog-id": 3 }));
    expect(await fetchProgramList(respond(200, listOf(otherCatalog)))).toMatchObject({
      ok: false,
    });
  });

  it(`rejects an incomplete list, a repeated program and fewer than ${MIN_PROGRAM_COUNT} programs`, async () => {
    const items = LIST["program-list"];
    expect(await fetchProgramList(respond(200, listOf(items.slice(0, 20), 52)))).toEqual({
      ok: false,
      error: "Acalog's program list is incomplete: received 20 of 52",
    });
    const repeated = [...items.slice(0, 51), items[0] as Record<string, unknown>];
    expect(await fetchProgramList(respond(200, listOf(repeated)))).toEqual({
      ok: false,
      error: "Acalog's program list repeats a program",
    });
    const publicItems = items.filter((item) => isPublicProgram(item as never));
    expect(await fetchProgramList(respond(200, listOf(publicItems.slice(0, 44))))).toEqual({
      ok: false,
      error: "Acalog listed only 44 public programs of 44 (at least 45 expected)",
    });
    expect((await fetchProgramList(respond(200, listOf(publicItems.slice(0, 45))))).ok).toBe(true);
  });

  it(`counts only public programs toward the ${MIN_PROGRAM_COUNT}-program floor`, async () => {
    const items = LIST["program-list"];
    const hide = (item: Record<string, unknown>) => ({
      ...item,
      status: { ...(item.status as object), visible: false },
    });
    // 48 of the 52 hidden: the list is complete, but only 4 programs would be left to show.
    const mostlyHidden = items.map((item, i) => (i < 48 ? hide(item) : item));
    expect(await fetchProgramList(respond(200, listOf(mostlyHidden)))).toEqual({
      ok: false,
      error: expect.stringMatching(
        /^Acalog listed only [34] public programs of 52 \(at least 45 expected\)$/,
      ),
    });
    expect(await fetchProgramList(respond(200, listOf(items.map(hide))))).toEqual({
      ok: false,
      error: "Acalog listed only 0 public programs of 52 (at least 45 expected)",
    });
    const inactive = items.map((item) => ({ ...item, status: { active: false, visible: true } }));
    expect((await fetchProgramList(respond(200, listOf(inactive)))).ok).toBe(false);
  });

  it("pages through a list longer than one page of 100", async () => {
    const many = Array.from({ length: 130 }, (_, i) => ({
      ...LIST["program-list"][0],
      id: 1000 + i,
    }));
    const seen: string[] = [];
    const fetcher: CatalogFetcher = async (url) => {
      seen.push(url);
      const page = new URL(url).searchParams.get("page") === "2" ? 2 : 1;
      const slice = page === 1 ? many.slice(0, 100) : many.slice(100);
      return { status: 200, headers: new Headers(), text: listOf(slice, 130) };
    };
    const result = await fetchProgramList(fetcher);
    expect(result.ok && result.data).toHaveLength(130);
    expect(seen).toEqual([programListUrl(1), programListUrl(2)]);
  });

  it("lets MissingFixtureError through (a missing fixture is a test bug, never an outage)", async () => {
    const fetcher: CatalogFetcher = async (url) => {
      throw new MissingFixtureError("catalog", "GET", url);
    };
    await expect(fetchProgramList(fetcher)).rejects.toBeInstanceOf(MissingFixtureError);
  });
});

describe("fetchProgramDetail", () => {
  it("reads a recorded program page", async () => {
    const result = await fetchProgramDetail(fetchCatalog, 174);
    expect(result.ok && result.data).toMatchObject({ id: 174, name: "Economics", "catalog-id": 4 });
  });

  it("rejects a page for another program than the one asked for", async () => {
    expect(await fetchProgramDetail(respond(200, read("program-172.json")), 174)).toEqual({
      ok: false,
      error: "Acalog sent program 172 for program 174",
    });
  });

  it("reads adhoc text inside course lists, defaulting to none", async () => {
    const page = JSON.parse(read("program-172.json")) as { cores: Record<string, unknown>[] };
    const first = page.cores[0] as Record<string, unknown>;
    first.adhocs = [{ content: "<p>OR</p>", placement: "after", "course-id": 12, name: "OR" }];
    const result = await fetchProgramDetail(respond(200, JSON.stringify(page)), 172);
    expect(result.ok && result.data.cores[0]?.adhocs).toEqual([
      { content: "<p>OR</p>", placement: "after", "course-id": 12, name: "OR" },
    ]);
    delete first.adhocs;
    const without = await fetchProgramDetail(respond(200, JSON.stringify(page)), 172);
    expect(without.ok && without.data.cores[0]?.adhocs).toEqual([]);
  });

  it("rejects a page nested too deeply to validate safely (instead of overflowing the stack)", async () => {
    // Built as text: JSON.stringify itself would overflow on 5,000 nested cores.
    const depth = 5000;
    const nested =
      '{"id":1,"name":"x","courses":[],"children":['.repeat(depth) + "]}".repeat(depth);
    const text = read("program-172.json").replace('"cores":[', `"cores":[${nested},`);
    expect(await fetchProgramDetail(respond(200, text), 172)).toEqual({
      ok: false,
      error: `Acalog sent a response nested deeper than ${MAX_JSON_DEPTH} levels`,
    });
    expect(jsonDepth(JSON.parse(text))).toBeGreaterThan(MAX_JSON_DEPTH);
    // Real pages nest far less (cores three deep).
    expect(jsonDepth(JSON.parse(read("program-172.json")))).toBeLessThan(20);
  });

  it("rejects a page whose cores are not an array", async () => {
    const broken = { ...JSON.parse(read("program-172.json")), cores: "none" };
    expect(await fetchProgramDetail(respond(200, JSON.stringify(broken)), 172)).toMatchObject({
      ok: false,
      error: expect.stringContaining("at cores"),
    });
  });
});

describe("program types", () => {
  it("recognises Acalog's interdisciplinary minor program type", () => {
    expect(isInterdisciplinaryMinorType(["Interdisciplinary Minors"])).toBe(true);
    expect(isInterdisciplinaryMinorType(["Academic Courses/Major and Minor Requirements"])).toBe(
      false,
    );
    expect(isInterdisciplinaryMinorType([])).toBe(false);
  });
});
