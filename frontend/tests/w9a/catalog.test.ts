import { describe, expect, it, vi } from "vitest";
import type * as CatalogModule from "@/server/catalog";
import { fixtureSections } from "../catalog/helpers";
import { withCatalogDb } from "../catalog/db";
import { MissingFixtureError } from "@/server/http/fixtures";
import { ApiError } from "@/server/http/errors";

/**
 * The careers pages' live catalog reads (app/(hub)/careers/_lib/catalog.ts) against the recorded Davidson API
 * (fixtures mode, server "now" 2026-09-30: current Fall 2026, registration Spring 2027). The failure paths wrap the
 * real service with switchable failures.
 */

const failures = vi.hoisted(() => ({
  history: new Map<string, unknown>(),
  terms: null as unknown,
}));

vi.mock("@/server/catalog", async (importOriginal) => {
  const real = await importOriginal<typeof CatalogModule>();
  return {
    ...real,
    resolveTerms: async (...args: Parameters<typeof real.resolveTerms>) => {
      if (failures.terms) throw failures.terms;
      return real.resolveTerms(...args);
    },
    getCourseHistory: async (code: string) => {
      const failure = failures.history.get(code);
      if (failure) throw failure;
      return real.getCourseHistory(code);
    },
  };
});

const { loadCareerTerms, loadCourseHistories } = await import("@/app/(hub)/careers/_lib/catalog");

withCatalogDb();

function reset() {
  failures.history.clear();
  failures.terms = null;
}

describe("loadCareerTerms", () => {
  it("is Fall 2026 / Spring 2027 / Fall 2027 on the fixtures' day", async () => {
    reset();
    const terms = await loadCareerTerms();
    expect(terms).toMatchObject({ current: "202601", registration: "202602", next: "202701" });
    // With the terms list, which the plan statuses are judged by.
    expect(terms?.schedule.find((term) => term.code === "202601")).toMatchObject({
      code: "202601",
      isActive: true,
    });
  });

  it("is null (logged) when the terms cannot be resolved", async () => {
    reset();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    failures.terms = new ApiError(503, "unavailable", "down");
    await expect(loadCareerTerms()).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
  });
});

describe("loadCourseHistories", () => {
  it("reads every course's availability, per term", async () => {
    reset();
    const histories = await loadCourseHistories(["CSC 221", "CSC 121", "CSC 221"]);
    expect([...histories.keys()]).toEqual(["CSC 221", "CSC 121"]);
    const csc221 = histories.get("CSC 221")!;
    const spring = csc221.find((entry) => entry.termCode === "202602");
    const fall = csc221.find((entry) => entry.termCode === "202601");
    const next = csc221.find((entry) => entry.termCode === "202701");
    const count = (term: string) =>
      fixtureSections(term).filter((section) => section.courseCode === "CSC 221").length;
    expect(spring).toEqual({
      termCode: "202602",
      status: "offered",
      sectionCount: count("202602"),
    });
    expect(fall).toEqual({ termCode: "202601", status: "offered", sectionCount: count("202601") });
    expect(next?.status).toBe("not-yet-published");
  });

  it("isolates a failing course (null) from the others", async () => {
    reset();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    failures.history.set("CSC 121", new ApiError(503, "unavailable", "down"));
    const histories = await loadCourseHistories(["CSC 121", "CSC 221"]);
    expect(histories.get("CSC 121")).toBeNull();
    expect(histories.get("CSC 221")?.length).toBeGreaterThan(0);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("never hides a missing fixture", async () => {
    reset();
    failures.history.set(
      "CSC 121",
      new MissingFixtureError("course-schedule", "GET", "https://example.test"),
    );
    await expect(loadCourseHistories(["CSC 121"])).rejects.toBeInstanceOf(MissingFixtureError);
  });
});
