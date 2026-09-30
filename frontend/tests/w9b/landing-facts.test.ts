import { afterEach, describe, expect, it, vi } from "vitest";
import {
  careersFact,
  coursesFact,
  LANDING_FACT_TIMEOUT_MS,
  loadLandingFacts,
} from "@/app/(marketing)/_lib/facts";
import { CAREERS } from "@/server/content/careers";

/** The landing's runtime facts with the catalog replaced: every way a fact can fail must leave it out. */

const catalog = vi.hoisted(() => ({
  resolveTerms: vi.fn(),
  countCourses: vi.fn(),
}));
vi.mock("@/server/catalog", () => catalog);

function registration(term = "202602") {
  catalog.resolveTerms.mockResolvedValue({ current: "202601", registration: term, terms: [] });
}

afterEach(() => {
  catalog.resolveTerms.mockReset();
  catalog.countCourses.mockReset();
});

describe("coursesFact", () => {
  it("counts the registration term's courses and names the term and source", async () => {
    registration();
    catalog.countCourses.mockResolvedValue(366);
    await expect(coursesFact()).resolves.toEqual({
      id: "courses",
      value: 366,
      label: "courses on the Spring 2027 schedule",
      source: "course-schedule",
    });
    expect(catalog.countCourses).toHaveBeenCalledWith("202602");
  });

  it("is left out while the registration term has no courses yet", async () => {
    registration("202701");
    catalog.countCourses.mockResolvedValue(0);
    await expect(coursesFact()).resolves.toBeNull();
  });
});

describe("careersFact", () => {
  it("counts the career paths while Careers is on", async () => {
    await expect(careersFact()).resolves.toEqual({
      id: "careers",
      value: CAREERS.length,
      label: "career paths, each with real Davidson courses",
      source: null,
    });
    vi.stubEnv("FEATURE_CAREERS", "false");
    await expect(careersFact()).resolves.toBeNull();
  });
});

describe("loadLandingFacts", () => {
  it("returns every fact that can be computed, in order", async () => {
    registration();
    catalog.countCourses.mockResolvedValue(1234);
    const facts = await loadLandingFacts();
    expect(facts.map((f) => [f.id, f.value])).toEqual([
      ["courses", 1234],
      ["careers", CAREERS.length],
    ]);
  });

  it("leaves out a fact whose service fails, logging the error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    catalog.resolveTerms.mockRejectedValue(new Error("catalog down"));
    const facts = await loadLandingFacts();
    expect(facts.map((f) => f.id)).toEqual(["careers"]);
    expect(log).toHaveBeenCalledWith(
      "[landing] the courses fact failed:",
      expect.objectContaining({ message: "catalog down" }),
    );
  });

  it("leaves out a fact that takes too long, quietly", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    registration();
    catalog.countCourses.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    const facts = await loadLandingFacts({ timeoutMs: 30 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(facts.map((f) => f.id)).toEqual(["careers"]);
    expect(log).not.toHaveBeenCalled();
    expect(LANDING_FACT_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("is empty when nothing can be computed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FEATURE_CAREERS", "false");
    catalog.resolveTerms.mockRejectedValue(new Error("down"));
    await expect(loadLandingFacts()).resolves.toEqual([]);
  });
});
