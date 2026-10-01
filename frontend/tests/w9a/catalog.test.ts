import { describe, expect, it, vi } from "vitest";
import type * as CatalogModule from "@/server/catalog";
import { fixtureSections } from "../catalog/helpers";
import { withCatalogDb } from "../catalog/db";
import { MissingFixtureError } from "@/server/http/fixtures";
import { ApiError } from "@/server/http/errors";
import { CAREERS } from "@/server/content/careers";

/**
 * The careers pages' live catalog reads (app/(hub)/careers/_lib/catalog.ts) against the recorded Davidson API
 * (fixtures mode, server "now" 2026-09-30: current Fall 2026, registration Spring 2027). The failure paths wrap the
 * real service with switchable failures.
 */

const failures = vi.hoisted(() => ({
  validate: null as unknown,
  history: new Map<string, unknown>(),
  count: null as number | null,
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
    validateCourseCodes: async (...args: Parameters<typeof real.validateCourseCodes>) => {
      if (failures.validate) throw failures.validate;
      return real.validateCourseCodes(...args);
    },
    countCourses: async (...args: Parameters<typeof real.countCourses>) =>
      failures.count ?? real.countCourses(...args),
    getCourseHistory: async (code: string) => {
      const failure = failures.history.get(code);
      if (failure) throw failure;
      return real.getCourseHistory(code);
    },
  };
});

const { loadCareerTerms, loadCourseHistories, loadRegistrationOfferings, offeredCount } =
  await import("@/app/(hub)/careers/_lib/catalog");

withCatalogDb();

function reset() {
  failures.validate = null;
  failures.history.clear();
  failures.count = null;
  failures.terms = null;
}

describe("loadCareerTerms", () => {
  it("is Fall 2026 / Spring 2027 / Fall 2027 on the fixtures' day", async () => {
    reset();
    await expect(loadCareerTerms()).resolves.toEqual({
      current: "202601",
      registration: "202602",
      next: "202701",
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

describe("loadRegistrationOfferings", () => {
  it("counts each career's courses on the Spring 2027 schedule, exactly as the schedule has them", async () => {
    reset();
    const offerings = await loadRegistrationOfferings();
    expect(offerings).not.toBeNull();
    expect(offerings!.term).toBe("202602");
    expect(offerings!.label).toBe("Spring 2027");
    const onSchedule = new Set(fixtureSections("202602").map((section) => section.courseCode));
    for (const career of CAREERS) {
      const codes = career.courses.map((course) => course.code);
      expect(offeredCount(offerings!, codes), career.slug).toBe(
        new Set(codes.filter((code) => onSchedule.has(code))).size,
      );
    }
  });

  it("says nothing (null) when the registration schedule is not published", async () => {
    reset();
    failures.count = 0;
    await expect(loadRegistrationOfferings()).resolves.toBeNull();
  });

  it("says nothing (null, logged) when the catalog fails", async () => {
    reset();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    failures.validate = new ApiError(
      503,
      "unavailable",
      "Schedule data is temporarily unavailable",
    );
    await expect(loadRegistrationOfferings()).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it("never hides a missing fixture", async () => {
    reset();
    failures.validate = new MissingFixtureError("course-schedule", "GET", "https://example.test");
    await expect(loadRegistrationOfferings()).rejects.toBeInstanceOf(MissingFixtureError);
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
