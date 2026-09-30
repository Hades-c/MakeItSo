import { describe, expect, it } from "vitest";
import { withCatalogDb } from "./db";
import { AvailabilitySchema } from "@/lib/types/catalog";
import { getCourseHistory } from "@/server/catalog";
import {
  computeAvailability,
  defaultHistoryTerms,
  lastSameSeasonTerms,
} from "@/server/catalog/availability";
import { drainBackground } from "@/server/catalog/background";
import { runCatalogCron } from "@/server/catalog/cron";
import type { TermMeta } from "@/server/catalog/meta";
import { ApiError } from "@/server/http/errors";

function meta(term: string, sectionCount: number, ingested = true): TermMeta {
  return {
    term,
    sectionCount,
    courseCount: sectionCount,
    contentHash: null,
    lastSuccessAt: ingested ? new Date("2026-09-30T16:00:00Z") : null,
    lastAttemptAt: null,
    lastError: null,
    lastErrorAt: null,
    fetchedAt: null,
    lockUntil: null,
    data: null,
  };
}

const resolved = { current: "202601", registration: "202602" };

describe("availability rules (PLAN §5)", () => {
  const metas = new Map(
    [
      meta("202401", 600),
      meta("202402", 600),
      meta("202403", 0),
      meta("202501", 600),
      meta("202502", 600),
      meta("202503", 0),
      meta("202601", 600),
      meta("202602", 0), // registration schedule not out yet
    ].map((m) => [m.term, m]),
  );

  it("offered / not-offered in published terms, not-yet-published after, usually offered", () => {
    const availability = computeAvailability({
      terms: ["202401", "202402", "202403", "202501", "202502", "202601", "202602", "202701"],
      resolved,
      metas,
      sectionCounts: new Map([
        ["202401", 1],
        ["202501", 2],
        ["202601", 1],
      ]),
    });
    expect(availability.map((a) => AvailabilitySchema.parse(a))).toEqual([
      { termCode: "202401", status: "offered", sectionCount: 1 },
      { termCode: "202402", status: "not-offered" },
      { termCode: "202403", status: "not-offered" },
      { termCode: "202501", status: "offered", sectionCount: 2 },
      { termCode: "202502", status: "not-offered" },
      { termCode: "202601", status: "offered", sectionCount: 1 },
      { termCode: "202602", status: "not-yet-published" },
      {
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202401", "202501", "202601"] },
      },
    ]);
  });

  it("needs ≥ 2 of the last 3 same-season terms, and never says 'offered' for an unpublished term", () => {
    const twoOfThree = computeAvailability({
      terms: ["202701"],
      resolved,
      metas,
      sectionCounts: new Map([
        ["202401", 1],
        ["202601", 1],
      ]),
    });
    expect(twoOfThree).toEqual([
      {
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202401", "202601"] },
      },
    ]);
    const once = computeAvailability({
      terms: ["202701", "202602"],
      resolved,
      metas,
      sectionCounts: new Map([["202601", 3]]),
    });
    expect(once).toEqual([
      { termCode: "202602", status: "not-yet-published" },
      { termCode: "202701", status: "not-yet-published" },
    ]);
  });

  it("leaves out past terms that were never ingested", () => {
    const partial = new Map([...metas].filter(([term]) => term !== "202402"));
    expect(
      computeAvailability({
        terms: ["202402", "202501"],
        resolved,
        metas: partial,
        sectionCounts: new Map(),
      }),
    ).toEqual([{ termCode: "202501", status: "not-offered" }]);
  });

  it("looks back at the three latest published same-season terms", () => {
    expect(lastSameSeasonTerms("202701", metas)).toEqual(["202401", "202501", "202601"]);
    expect(lastSameSeasonTerms("202702", metas)).toEqual(["202402", "202502"]);
    expect(lastSameSeasonTerms("202603", metas)).toEqual([]);
  });

  it("reports regular terms from 202201 through the term after registration, plus summers with data", () => {
    const withSummer = new Map([...metas, ["202503", meta("202503", 4)] as const]);
    expect(defaultHistoryTerms(resolved, withSummer)).toEqual([
      "202201",
      "202202",
      "202301",
      "202302",
      "202401",
      "202402",
      "202501",
      "202502",
      "202503",
      "202601",
      "202602",
      "202701",
    ]);
  });
});

describe("getCourseHistory over the recorded terms", () => {
  withCatalogDb();

  it("loads the current and registration terms, then the backfill fills in history", async () => {
    const early = await getCourseHistory("hum103");
    expect(early.map((a) => a.termCode)).toEqual(["202601", "202602", "202701"]);
    await drainBackground();
    const history = await getCourseHistory("HUM 103");
    expect(history).toEqual([
      { termCode: "202201", status: "offered", sectionCount: 1 },
      { termCode: "202202", status: "not-offered" },
      { termCode: "202301", status: "offered", sectionCount: 1 },
      { termCode: "202302", status: "not-offered" },
      { termCode: "202401", status: "offered", sectionCount: 1 },
      { termCode: "202402", status: "not-offered" },
      { termCode: "202501", status: "offered", sectionCount: 1 },
      { termCode: "202502", status: "not-offered" },
      { termCode: "202601", status: "offered", sectionCount: 1 },
      { termCode: "202602", status: "not-offered" },
      {
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202401", "202501", "202601"] },
      },
    ]);
  });

  it("applies 'usually offered' only with 2 of the last 3 Falls", async () => {
    await runCatalogCron();
    const last = async (code: string) => (await getCourseHistory(code)).at(-1);
    expect(await last("HIS 357")).toEqual({
      termCode: "202701",
      status: "not-yet-published",
      usually: { season: "Fall", basedOn: ["202501", "202601"] },
    });
    expect(await last("ENV 237")).toMatchObject({ usually: { basedOn: ["202401", "202601"] } });
    expect(await last("ECO 238")).toEqual({ termCode: "202701", status: "not-yet-published" });
    expect((await getCourseHistory("ZZZ 999")).map((a) => a.status)).toEqual([
      ...Array<string>(10).fill("not-offered"),
      "not-yet-published",
    ]);
  });

  it("rejects a malformed code", async () => {
    await expect(getCourseHistory("hello")).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
    await expect(getCourseHistory("hello")).rejects.toBeInstanceOf(ApiError);
  });
});
