import { describe, expect, it } from "vitest";
import { withCatalogDb } from "./db";
import { AvailabilitySchema } from "@/lib/types/catalog";
import { getCourseHistory } from "@/server/catalog";
import {
  availabilityComplete,
  computeAvailability,
  defaultHistoryTerms,
  previousSameSeasonTerms,
  usuallyOffered,
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
    peakSectionCount: sectionCount,
    peakAt: null,
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

  it("looks back at the three same-season terms right before a term", () => {
    expect(previousSameSeasonTerms("202701")).toEqual(["202401", "202501", "202601"]);
    expect(previousSameSeasonTerms("202702")).toEqual(["202402", "202502", "202602"]);
    expect(previousSameSeasonTerms("198901")).toEqual(["198801"]); // academic years start in 1988
  });

  it("makes no 'usually offered' claim while one of those three terms was never ingested", () => {
    // Fall 2023–2025 never ingested (only Fall 2022 and Fall 2026 are): Fall 2022 is not one of the last 3 Falls.
    const gaps = new Map(
      [meta("202201", 600), meta("202601", 600), meta("202602", 500)].map((m) => [m.term, m]),
    );
    const counts = new Map([
      ["202201", 1],
      ["202601", 1],
    ]);
    expect(usuallyOffered("202701", gaps, counts)).toBeNull();
    expect(
      computeAvailability({ terms: ["202701"], resolved, metas: gaps, sectionCounts: counts }),
    ).toEqual([{ termCode: "202701", status: "not-yet-published" }]);
    // Once the three are known, the rule applies to exactly them.
    const full = new Map([
      ...gaps,
      ...[meta("202401", 600), meta("202501", 600)].map((m) => [m.term, m] as const),
    ]);
    expect(usuallyOffered("202701", full, counts)).toBeNull(); // ran in 1 of 202401, 202501, 202601
    expect(usuallyOffered("202701", full, new Map([...counts, ["202501", 2]]))).toEqual({
      season: "Fall",
      basedOn: ["202501", "202601"],
    });
  });

  it("says whether the answer is final (no term it depends on waits for the backfill)", () => {
    const window = ["202401", "202402", "202403", "202501", "202502", "202503", "202601", "202602"];
    expect(availabilityComplete({ terms: window, resolved, metas, window })).toBe(true);
    expect(
      availabilityComplete({ terms: [...window, "202701", "202702"], resolved, metas, window }),
    ).toBe(true);
    const partial = new Map([...metas].filter(([term]) => term !== "202501"));
    expect(availabilityComplete({ terms: window, resolved, metas: partial, window })).toBe(false);
    // 202701's "usually" needs 202501 even when 202501 itself is not asked for.
    expect(availabilityComplete({ terms: ["202701"], resolved, metas: partial, window })).toBe(
      false,
    );
    expect(availabilityComplete({ terms: ["202602"], resolved, metas: partial, window })).toBe(
      true,
    );
    // Terms outside the ingest window are never ingested and count as known.
    expect(availabilityComplete({ terms: ["201901"], resolved, metas, window })).toBe(true);
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
