import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import Program from "@/models/Program";
import SourceSync from "@/models/SourceSync";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ExternalFetchError } from "@/server/http";
import { getProgram, listPrograms, syncPrograms } from "@/server/programs";
import { programListUrl } from "@/server/programs/catalog-info";
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

function deps(fetcher: CatalogFetcher, at: Date = now()): ProgramsDeps {
  return { fetcher, now: () => at };
}

async function catalogStatus() {
  return (await getSourceStatuses(now())).find((row) => row.id === "catalog");
}

describe("syncPrograms (weekly list refresh)", () => {
  it("stores the recorded list: 51 public programs, no page reads when nothing changed", async () => {
    const result = await syncPrograms();
    expect(result).toEqual({ ok: true, count: 51, pages: { updated: 0, failed: 0, deferred: 0 } });
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
      detailFetchedAt: null,
      offerings: [],
    });
    expect(await catalogStatus()).toMatchObject({ status: "ok", count: 51, error: null });
    // Offerings still come from the snapshot until a page is read.
    const list = await listPrograms();
    expect(list).toHaveLength(51);
    expect(list.find((p) => p.acalogId === 172)?.offerings).toHaveLength(2);
  });

  it.each([
    [
      "a WAF challenge",
      { status: 202, text: "", headers: new Headers({ "x-amzn-waf-action": "challenge" }) },
      /bot challenge/,
    ],
    ["an empty body", { status: 200, text: "", headers: new Headers() }, /empty response/],
    ["a non-JSON body", { status: 200, text: "<html></html>", headers: new Headers() }, /not JSON/],
    ["fewer than 45 programs", listResponse(LIST["program-list"].slice(0, 30)), /only 30 programs/],
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

  it("re-reads the pages whose modified stamp changed, and only those", async () => {
    const changed = LIST["program-list"].map((item) =>
      item.id === 174 ? { ...item, modified: "2026-10-05 09:00:00" } : item,
    );
    const { fetcher, pageReads } = upstream(listResponse(changed));
    const result = await runProgramSync(deps(fetcher));
    expect(result).toEqual({ ok: true, count: 51, pages: { updated: 1, failed: 0, deferred: 0 } });
    expect(pageReads).toEqual(["https://catalog.davidson.edu/widget-api/catalog/4/program/174"]);
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
    expect(result).toMatchObject({ ok: true, count: 52, pages: { updated: 1 } });
    expect(pageReads).toHaveLength(1);
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
    expect(result).toEqual({ ok: true, count: 51, pages: { updated: 0, failed: 1, deferred: 0 } });
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
    expect(result.pages).toEqual({ deferred: 3, updated: 0, failed: 0 });
    expect(pageReads).toEqual([]);
  });
});
