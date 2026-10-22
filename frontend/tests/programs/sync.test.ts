import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import Program from "@/models/Program";
import SourceSync from "@/models/SourceSync";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import * as z from "zod";
import { ExternalFetchError, MissingFixtureError } from "@/server/http";
import { getProgram, listPrograms, programNames } from "@/server/programs";
import { MAX_LIST_DROP_SHARE, programListUrl } from "@/server/programs/catalog-info";
import { getProgramWith, type ProgramsDeps, runProgramSync } from "@/server/programs/service";
import { type CatalogFetcher, fetchCatalog, type RawResponse } from "@/server/programs/upstream";
import { getSourceStatuses } from "@/server/sync";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "external", "catalog");
type ListItem = Record<string, unknown> & { id: number; modified: string };
const LIST = JSON.parse(readFileSync(path.join(FIXTURES, "programs.json"), "utf8")) as {
  count: number;
  "program-list": ListItem[];
};

function json(value: unknown): RawResponse {
  return { status: 200, headers: new Headers(), text: JSON.stringify(value) };
}

function listResponse(items: ListItem[]): RawResponse {
  return json({ count: items.length, "program-list": items });
}

/** Answers the list URL with `list`, program pages from `pages` or the fixtures, and counts page reads. */
function upstream(
  list: RawResponse | (() => Promise<RawResponse>),
  pages: Record<string, RawResponse> = {},
) {
  const pageReads: string[] = [];
  const fetcher: CatalogFetcher = async (url) => {
    if (url === programListUrl()) return typeof list === "function" ? list() : list;
    pageReads.push(url);
    const id = /\/program\/(\d+)$/.exec(url)?.[1] ?? "";
    return pages[id] ?? fetchCatalog(url);
  };
  return { fetcher, pageReads };
}

/** The program pages the fixtures record; every other page answers 404 ("not recorded"). */
const RECORDED_PAGES = [172, 174, 188];
/** Public programs whose page the fixtures do not record (51 public, 3 recorded). */
const UNRECORDED = 48;
const pageUrl = (id: number) => `https://catalog.davidson.edu/widget-api/catalog/4/program/${id}`;

function hidden(item: ListItem): ListItem {
  return { ...item, status: { ...(item.status as object), visible: false } };
}

function deps(fetcher: CatalogFetcher, at: Date = now()): ProgramsDeps {
  return { fetcher, now: () => at };
}

async function catalogStatus() {
  return (await getSourceStatuses(now())).find((row) => row.id === "catalog");
}

describe("syncPrograms (weekly list refresh)", () => {
  it("stores the recorded list (51 public programs) and reads every page it has not stored yet", async () => {
    const { fetcher, pageReads } = upstream(json(LIST));
    const result = await runProgramSync(deps(fetcher));
    expect(result).toEqual({
      ok: true,
      count: 51,
      pages: { updated: RECORDED_PAGES.length, failed: UNRECORDED, deferred: 0 },
    });
    expect(pageReads).toHaveLength(51);
    expect(await Program.countDocuments({ listed: true })).toBe(51);
    expect(await Program.countDocuments({ acalogId: 178 })).toBe(0);
    const doc = await Program.findOne({ acalogId: 172 }).lean();
    expect(doc).toMatchObject({
      catalogId: 4,
      catalogYear: "2026-2027",
      legacyId: 1799,
      name: "Computer Science",
      code: "CS",
      url: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1799",
      listed: true,
      listModified: "2026-09-15 15:03:36",
    });
    // The page was read although its stamp matches the snapshot's: the snapshot has no course codes.
    expect(doc?.detailFetchedAt).not.toBeNull();
    expect(doc?.offerings).toHaveLength(2);
    expect(doc?.offerings.some((o) => (o.courseCodes ?? []).includes("CSC 221"))).toBe(true);
    // A page that could not be read keeps no offerings of its own...
    const anthropology = await Program.findOne({ acalogId: 162 }).lean();
    expect(anthropology).toMatchObject({ detailFetchedAt: null, offerings: [] });
    expect(anthropology?.lastDetailError).toMatch(/404/);
    expect(await catalogStatus()).toMatchObject({ status: "ok", count: 51, error: null });
    // ...and offerings still come from the snapshot until it is read.
    const list = await listPrograms();
    expect(list).toHaveLength(51);
    expect(list.find((p) => p.acalogId === 162)?.offerings).toHaveLength(2);
  });

  it("on the next run reads only the pages still unread, not the stored ones whose stamp did not move", async () => {
    await runProgramSync(deps(upstream(json(LIST)).fetcher));
    const { fetcher, pageReads } = upstream(json(LIST));
    const result = await runProgramSync(deps(fetcher));
    expect(result.pages).toEqual({ updated: 0, failed: UNRECORDED, deferred: 0 });
    for (const id of RECORDED_PAGES) expect(pageReads).not.toContain(pageUrl(id));
  });

  it.each([
    [
      "a WAF challenge",
      { status: 202, text: "", headers: new Headers({ "x-amzn-waf-action": "challenge" }) },
      /bot challenge/,
    ],
    ["a non-200 answer", { status: 503, text: "", headers: new Headers() }, /answered 503/],
    ["an empty body", { status: 200, text: "", headers: new Headers() }, /empty response/],
    ["a non-JSON body", { status: 200, text: "<html></html>", headers: new Headers() }, /not JSON/],
    [
      "fewer than 45 programs",
      listResponse(LIST["program-list"].slice(0, 30)),
      /only \d+ public programs of 30/,
    ],
    [
      "a list whose programs are suddenly hidden",
      listResponse(LIST["program-list"].map((item, i) => (i < 48 ? hidden(item) : item))),
      /only [34] public programs of 52/,
    ],
    [
      "a list of hidden programs only",
      listResponse(LIST["program-list"].map(hidden)),
      /only 0 public programs of 52/,
    ],
    [
      "an incomplete list",
      json({ count: 52, "program-list": LIST["program-list"].slice(0, 20) }),
      /incomplete: received 20 of 52/,
    ],
  ] as const)(
    "keeps the last good copy on %s and records the error",
    async (_label, response, error) => {
      const t0 = now();
      await runProgramSync(deps(upstream(json(LIST)).fetcher, t0));
      const before = await Program.find({}).sort({ acalogId: 1 }).lean();

      const later = new Date(t0.getTime() + 7 * 24 * 60 * 60_000);
      const result = await runProgramSync(deps(upstream(response).fetcher, later));
      expect(result).toMatchObject({ ok: false, count: 0, error: expect.stringMatching(error) });
      expect(await Program.find({}).sort({ acalogId: 1 }).lean()).toEqual(before);
      expect(await catalogStatus()).toMatchObject({
        status: "error",
        lastSync: t0,
        count: 51,
        error: expect.stringMatching(error),
      });
      expect(await listPrograms()).toHaveLength(51);
    },
  );

  it("records a failure (and keeps serving the snapshot) when the very first sync fails", async () => {
    const failing = upstream(async () => {
      throw new ExternalFetchError("catalog", programListUrl(), "http", "failed", 500);
    });
    expect(await runProgramSync(deps(failing.fetcher))).toEqual({
      ok: false,
      count: 0,
      error: "Acalog answered 500",
    });
    expect(await SourceSync.findOne({ sourceId: "catalog" }).lean()).toMatchObject({
      ok: false,
      lastError: "Acalog answered 500",
      consecutiveFailures: 1,
    });
    expect(await listPrograms()).toHaveLength(51);
  });

  it("keeps serving the snapshot, and records the error, when the first sync ever lists only hidden programs", async () => {
    const result = await runProgramSync(
      deps(upstream(listResponse(LIST["program-list"].map(hidden))).fetcher),
    );
    expect(result).toMatchObject({ ok: false, count: 0 });
    expect(await Program.countDocuments({})).toBe(0);
    expect(await SourceSync.findOne({ sourceId: "catalog" }).lean()).toMatchObject({
      ok: false,
      consecutiveFailures: 1,
    });
    const names = await programNames();
    expect(names.majors).toContain("Major in Economics (A.B. Degree)");
    expect(
      z.enum(names.majors as [string, ...string[]]).safeParse("Major in Economics (A.B. Degree)")
        .success,
    ).toBe(true);
  });

  it(`refuses a list that would drop more than ${MAX_LIST_DROP_SHARE * 100}% of the programs we have`, async () => {
    const t0 = now();
    await runProgramSync(deps(upstream(json(LIST)).fetcher, t0));
    // A catalog that had grown to 66 programs; the new list has only the recorded 51 public ones.
    await Program.insertMany(
      Array.from({ length: 15 }, (_, i) => ({
        acalogId: 6000 + i,
        catalogId: 4,
        catalogYear: "2026-2027",
        name: `Program ${i}`,
        url: "https://catalog.davidson.edu/content.php?catoid=28&navoid=1340",
        listed: true,
        listSyncedAt: t0,
        fetchedAt: t0,
      })),
    );
    const result = await runProgramSync(deps(upstream(json(LIST)).fetcher));
    expect(result).toEqual({
      ok: false,
      count: 0,
      error: "Acalog's list would drop 15 of the 66 programs we have; the last good copy is kept",
    });
    expect(await Program.countDocuments({ listed: true })).toBe(66);
    expect(await catalogStatus()).toMatchObject({ status: "error" });

    // Dropping fewer is a normal change.
    await Program.deleteMany({ acalogId: trusted({ $gte: 6005 }) });
    expect(await runProgramSync(deps(upstream(json(LIST)).fetcher))).toMatchObject({
      ok: true,
      count: 51,
    });
    expect(await Program.countDocuments({ listed: true })).toBe(51);
  });

  it("records exactly one failure when something unexpected throws, after or before the list is stored", async () => {
    const spy = vi.spyOn(Program, "bulkWrite").mockRejectedValueOnce(new Error("mongo is down"));
    const result = await runProgramSync(deps(upstream(json(LIST)).fetcher));
    spy.mockRestore();
    expect(result).toEqual({
      ok: false,
      count: 0,
      error: "The program sync failed: Error: mongo is down",
    });
    expect(await SourceSync.findOne({ sourceId: "catalog" }).lean()).toMatchObject({
      ok: false,
      consecutiveFailures: 1,
      lastError: "The program sync failed: Error: mongo is down",
    });
  });

  it("counts a page that throws or cannot be validated as failed, and the run as a success", async () => {
    const changed = LIST["program-list"].map((item) =>
      [172, 174].includes(item.id) ? { ...item, modified: "2026-10-05 09:00:00" } : item,
    );
    const depth = 3000;
    const nested =
      '{"id":1,"name":"x","courses":[],"children":['.repeat(depth) + "]}".repeat(depth);
    const page172 = readFileSync(path.join(FIXTURES, "program-172.json"), "utf8").replace(
      '"cores":[',
      `"cores":[${nested},`,
    );
    const fetcher: CatalogFetcher = async (url) => {
      if (url === programListUrl()) return listResponse(changed);
      if (url.endsWith("/program/172"))
        return { status: 200, headers: new Headers(), text: page172 };
      if (url.endsWith("/program/174")) throw new TypeError("socket hang up");
      return fetchCatalog(url);
    };
    const result = await runProgramSync(deps(fetcher));
    // 188 is read; 172 and 174 fail, as do the pages the fixtures do not record.
    expect(result).toEqual({
      ok: true,
      count: 51,
      pages: { updated: 1, failed: 2 + UNRECORDED, deferred: 0 },
    });
    expect((await Program.findOne({ acalogId: 172 }).lean())?.lastDetailError).toMatch(
      /nested deeper/,
    );
    expect(await catalogStatus()).toMatchObject({ status: "ok", count: 51 });
  });

  it("lets MissingFixtureError through without recording anything", async () => {
    const fetcher: CatalogFetcher = async (url) => {
      throw new MissingFixtureError("catalog", "GET", url);
    };
    await expect(runProgramSync(deps(fetcher))).rejects.toBeInstanceOf(MissingFixtureError);
    expect(await SourceSync.countDocuments({ sourceId: "catalog" })).toBe(0);
  });

  it("stops listing a program that left the catalog", async () => {
    await runProgramSync(deps(upstream(json(LIST)).fetcher));
    const without = LIST["program-list"].filter((item) => item.id !== 204); // Writing
    const result = await runProgramSync(deps(upstream(listResponse(without)).fetcher));
    expect(result).toMatchObject({ ok: true, count: 50 });
    expect((await Program.findOne({ acalogId: 204 }).lean())?.listed).toBe(false);
    const list = await listPrograms();
    expect(list).toHaveLength(50);
    expect(list.some((p) => p.acalogId === 204)).toBe(false);
    expect(await getProgram(204)).toBeNull();
  });

  it("re-reads the stored pages whose modified stamp changed, and only those", async () => {
    await runProgramSync(deps(upstream(json(LIST)).fetcher));
    const changed = LIST["program-list"].map((item) =>
      item.id === 174 ? { ...item, modified: "2026-10-05 09:00:00" } : item,
    );
    const { fetcher, pageReads } = upstream(listResponse(changed));
    const result = await runProgramSync(deps(fetcher));
    expect(result).toEqual({
      ok: true,
      count: 51,
      pages: { updated: 1, failed: UNRECORDED, deferred: 0 },
    });
    expect(pageReads).toContain(pageUrl(174));
    expect(pageReads).not.toContain(pageUrl(172));
    expect(pageReads).not.toContain(pageUrl(188));
    const doc = await Program.findOne({ acalogId: 174 }).lean();
    expect(doc?.detailFetchedAt).not.toBeNull();
    expect(doc?.listModified).toBe("2026-10-05 09:00:00");
    expect(doc?.offerings.map((o) => o.name)).toEqual([
      "Major in Economics (A.B. Degree)",
      "Minor in Economics",
    ]);
    // The page is now cached: a read does not go back to Acalog.
    const reads = upstream(listResponse(changed));
    await getProgramWith(174, deps(reads.fetcher));
    expect(reads.pageReads).toEqual([]);
  });

  it("reads the page of a program the snapshot does not know", async () => {
    const newcomer: ListItem = {
      ...(LIST["program-list"][0] as ListItem),
      id: 5000,
      "legacy-id": 5001,
      name: "Quantum Studies",
      code: "QST",
    };
    const page = {
      ...newcomer,
      description: "",
      cores: [
        {
          id: 1,
          name: "Minor Requirements",
          description: "<p>Six courses, including QST 101.</p>",
          courses: [],
          children: [],
        },
      ],
    };
    const { fetcher, pageReads } = upstream(listResponse([...LIST["program-list"], newcomer]), {
      "5000": json(page),
    });
    const result = await runProgramSync(deps(fetcher));
    expect(result).toMatchObject({
      ok: true,
      count: 52,
      pages: { updated: RECORDED_PAGES.length + 1 },
    });
    expect(pageReads).toContain(pageUrl(5000));
    expect((await listPrograms({ kinds: ["minor"] })).find((p) => p.acalogId === 5000)).toEqual({
      acalogId: 5000,
      name: "Quantum Studies",
      catalogYear: "2026-2027",
      offerings: [{ kind: "minor", name: "Minor in Quantum Studies" }],
    });
  });

  it("keeps a page's last good copy when its refresh fails during a sync", async () => {
    await getProgramWith(172, deps(fetchCatalog));
    const changed = LIST["program-list"].map((item) =>
      item.id === 172 ? { ...item, modified: "2026-10-05 09:00:00" } : item,
    );
    const { fetcher } = upstream(listResponse(changed), {
      "172": { status: 202, text: "", headers: new Headers() },
    });
    const result = await runProgramSync(deps(fetcher));
    expect(result).toEqual({
      ok: true,
      count: 51,
      pages: { updated: 2, failed: 1 + UNRECORDED, deferred: 0 },
    });
    const doc = await Program.findOne({ acalogId: 172 }).lean();
    expect(doc?.offerings).toHaveLength(2);
    expect(doc?.lastDetailError).toMatch(/bot challenge/);
  });

  it("leaves pages for later once the time budget is spent", async () => {
    const changed = LIST["program-list"].map((item) =>
      [172, 174, 188].includes(item.id) ? { ...item, modified: "2026-10-05 09:00:00" } : item,
    );
    const { fetcher, pageReads } = upstream(listResponse(changed));
    // The run starts at 0 ms; every later reading is past the 40 s budget.
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(60_000);
    const result = await runProgramSync(deps(fetcher));
    // Nothing is stored yet, so all 51 pages were due.
    expect(result.pages).toEqual({ deferred: 51, updated: 0, failed: 0 });
    expect(pageReads).toEqual([]);
  });
});
