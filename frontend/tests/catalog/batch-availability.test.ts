import { describe, expect, it, vi } from "vitest";
import { withCatalogDb } from "./db";
import CatalogSection from "@/models/CatalogSection";
import { courseAvailability, coursesAvailability } from "@/server/catalog/history";

/**
 * The /courses results read every row's availability in one batch (hardening regression: one aggregate per result
 * row, 20 on a page). Same answers as the one-code read.
 */

withCatalogDb();

describe("coursesAvailability", () => {
  it("answers like courseAvailability for each code, with one aggregate for all of them", async () => {
    const codes = ["CSC 221", "HIS 357", "ECO 232", "ZZZ 999"];
    const terms = ["202601", "202602", "202701"];
    const one = new Map<string, unknown>();
    for (const code of codes) one.set(code, await courseAvailability(code, terms));
    const aggregate = vi.spyOn(CatalogSection, "aggregate");
    const batch = await coursesAvailability(codes, terms);
    expect(aggregate).toHaveBeenCalledTimes(1);
    aggregate.mockRestore();
    for (const code of codes) expect(batch.get(code), code).toEqual(one.get(code));
    expect(batch.get("CSC 221")?.find((a) => a.termCode === "202602")?.status).toBe("offered");
    expect(batch.get("ZZZ 999")?.every((a) => a.status !== "offered")).toBe(true);
  });

  it("returns an empty map for no codes", async () => {
    expect((await coursesAvailability([], ["202602"])).size).toBe(0);
  });
});
