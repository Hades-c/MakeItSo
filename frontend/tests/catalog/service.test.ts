import { describe, expect, it, vi } from "vitest";
import { setNow, upstreamDown, withCatalogDb } from "./db";
import { fixtureItems, fixtureSections } from "./helpers";
import {
  CatalogFiltersSchema,
  CatalogSearchResultSchema,
  CourseSchema,
  SectionSchema,
} from "@/lib/types/catalog";
import CatalogMeta from "@/models/CatalogMeta";
import CatalogSection from "@/models/CatalogSection";
import {
  browseTerm,
  countCourses,
  getCatalogFilters,
  getCourse,
  getCourseHistory,
  getSection,
  resolveTerms,
  searchCourses,
  validateCourseCodes,
} from "@/server/catalog";
import { drainBackground } from "@/server/catalog/background";
import { UNAVAILABLE_MESSAGE } from "@/server/catalog/config";
import { runCatalogCron } from "@/server/catalog/cron";
import { refreshFilters, setFiltersFetchForTests } from "@/server/catalog/filters";
import { ingestTerm } from "@/server/catalog/ingest";
import { acquireTermLease, releaseTermLease, termKey } from "@/server/catalog/meta";
import {
  refreshTerm,
  setColdDeadlineForTests,
  setIngestDepsForTests,
} from "@/server/catalog/refresh";
import { resetCatalogState } from "@/server/catalog/state";
import { setTermsFetchForTests } from "@/server/catalog/terms";
import {
  fetchFilters,
  fetchSectionsPage,
  fetchTermsList,
  type FetchSectionsPage,
} from "@/server/catalog/upstream";
import { ApiError } from "@/server/http/errors";

withCatalogDb();

describe("the frozen surface (PLAN §4.1.3)", () => {
  it("server/catalog exports exactly its frozen functions", async () => {
    const catalog = await import("@/server/catalog");
    const functions = Object.entries(catalog)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort();
    expect(functions).toEqual([
      "browseTerm",
      "countCourses",
      "getCatalogFilters",
      "getCourse",
      "getCourseHistory",
      "getSection",
      "resolveTerms",
      "searchCourses",
      "validateCourseCodes",
    ]);
  });
});

const lastSuccess = async (term: string) =>
  (await CatalogMeta.findOne({ key: termKey(term) }).lean())?.lastSuccessAt?.toISOString();

describe("cold start", () => {
  it("loads the registration term synchronously on the first search", async () => {
    expect(await CatalogSection.countDocuments()).toBe(0);
    const result = CatalogSearchResultSchema.parse(await searchCourses({ q: "CSC121" }));
    expect(result).toMatchObject({ term: "202602", total: 1, page: 1, pageSize: 25 });
    expect(result.items.map((i) => i.code)).toEqual(["CSC 121"]);
    expect(result.asOf).toBe("2026-09-30T16:00:00.000Z");
    expect(await CatalogSection.countDocuments({ termCode: "202602" })).toBe(485);
  });

  it("answers 503 'temporarily unavailable' when the cold load fails, and fails fast after", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchPage = vi.fn(async () => {
      throw upstreamDown();
    });
    setIngestDepsForTests({ fetchPage });
    const error = await searchCourses({}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: "unavailable", message: UNAVAILABLE_MESSAGE });
    await expect(getCourse("202602", "CSC 121")).rejects.toMatchObject({ status: 503 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("waits for another instance's cold load instead of fetching twice", async () => {
    const fetchPage = vi.fn(async () => fixtureItems("202602"));
    setIngestDepsForTests({ fetchPage });
    const owner = await acquireTermLease("202602"); // the other instance
    expect(owner).not.toBeNull();
    const pending = searchCourses({ q: "CSC 121" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await ingestTerm("202602"); // … which loads the term while holding the lease
    await releaseTermLease("202602", owner!);
    const result = await pending;
    expect(result.items.map((i) => i.code)).toEqual(["CSC 121"]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("answers 503 within one deadline when upstream hangs, and finishes the load in the background", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setColdDeadlineForTests(300);
    // The terms list hangs too: a cold start must not wait for it (the date rules answer).
    setTermsFetchForTests((options) =>
      new Promise((resolve) => setTimeout(resolve, 1_500)).then(() => fetchTermsList(options)),
    );
    const fetchPage = vi.fn(
      (term: string) =>
        new Promise<unknown[]>((resolve) => setTimeout(() => resolve(fixtureItems(term)), 1_500)),
    );
    setIngestDepsForTests({ fetchPage });
    const started = Date.now();
    const error = await searchCourses({ q: "CSC 121" }).catch((e: unknown) => e);
    expect(Date.now() - started).toBeLessThan(1_200);
    expect(error).toMatchObject({ status: 503, message: UNAVAILABLE_MESSAGE });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    // A second read joins the running load instead of fetching again …
    await searchCourses({ q: "CSC 121" }).catch(() => undefined);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    // … which completes after the responses; then the term is served.
    await drainBackground();
    const result = await searchCourses({ q: "CSC 121" });
    expect(result.items.map((i) => i.code)).toEqual(["CSC 121"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("cold-loads the current and registration terms in parallel for a course history", async () => {
    let running = 0;
    let peak = 0;
    const fetchPage = vi.fn(async (term: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 150));
      running -= 1;
      return fixtureItems(term);
    });
    setIngestDepsForTests({ fetchPage });
    await getCourseHistory("CSC 121");
    expect(
      fetchPage.mock.calls
        .slice(0, 2)
        .map(([term]) => term)
        .sort(),
    ).toEqual(["202601", "202602"]);
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  it("shares one wait per term among cold reads while another instance loads it", async () => {
    const owner = await acquireTermLease("202602"); // the other instance
    const reads = vi.spyOn(CatalogMeta, "findOne");
    const pending = Promise.all(Array.from({ length: 10 }, () => searchCourses({ q: "CSC 121" })));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const polls = reads.mock.calls.filter(
      ([filter]) => (filter as { key?: string } | undefined)?.key === termKey("202602"),
    ).length;
    expect(polls).toBeLessThanOrEqual(5); // ~1 poll per 250 ms, not 10
    await ingestTerm("202602");
    await releaseTermLease("202602", owner!);
    const results = await pending;
    expect(results.every((r) => r.items[0]?.code === "CSC 121")).toBe(true);
  });

  it("never fetches a term outside 202201 … registration", async () => {
    // No fixture exists for these terms: a fetch would throw MissingFixtureError.
    expect(await searchCourses({ term: "201901" })).toEqual({
      term: "201901",
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      asOf: null,
    });
    expect(await getCourse("202701", "CSC 221")).toBeNull();
    expect(await countCourses("202801")).toBe(0);
  });
});

describe("stale-while-revalidate", () => {
  it("serves a stale hot term and refreshes it in the background after 15 minutes", async () => {
    await searchCourses({});
    setNow("2026-09-30T12:10:00-04:00");
    await searchCourses({});
    await drainBackground();
    expect(await lastSuccess("202602")).toBe("2026-09-30T16:00:00.000Z");

    resetCatalogState();
    setNow("2026-09-30T12:20:00-04:00");
    const stale = await searchCourses({ q: "CSC 121" });
    expect(stale.asOf).toBe("2026-09-30T16:00:00.000Z");
    await drainBackground();
    expect(await lastSuccess("202602")).toBe("2026-09-30T16:20:00.000Z");
  });

  it("does not refresh past terms on reads (the cron does)", async () => {
    await searchCourses({ term: "202501" });
    resetCatalogState();
    setNow("2026-10-02T12:00:00-04:00");
    await searchCourses({ term: "202501" });
    await drainBackground();
    expect(await lastSuccess("202501")).toBe("2026-09-30T16:00:00.000Z");
  });

  it("keeps serving stale data while background refreshes fail", async () => {
    await searchCourses({});
    resetCatalogState();
    setNow("2026-09-30T13:00:00-04:00");
    setIngestDepsForTests({
      fetchPage: async () => {
        throw upstreamDown();
      },
    });
    const result = await searchCourses({ q: "CSC 121" });
    await drainBackground();
    expect(result.items).toHaveLength(1);
    const meta = await CatalogMeta.findOne({ key: termKey("202602") }).lean();
    expect(meta?.lastError).toContain("Upstream answered 503");
    expect(meta?.lastSuccessAt?.toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("rebuilds the in-process index when another instance changed the term", async () => {
    await searchCourses({});
    expect((await getCourse("202602", "CSC 121"))?.title).toBe("Programming & Problem Solving");
    const items = fixtureItems("202602").map((item) =>
      (item as { display: string }).display.startsWith("CSC 121")
        ? { ...(item as object), course_title: "Renamed Upstream" }
        : item,
    );
    setIngestDepsForTests({ fetchPage: async () => items });
    await refreshTerm("202602");
    resetCatalogState(); // a different instance: its own caches, same database
    expect((await getCourse("202602", "CSC 121"))?.title).toBe("Renamed Upstream");
  });
});

describe("reads", () => {
  it("rejects invalid input with a 400", async () => {
    await expect(searchCourses({ term: "2026" })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
    await expect(searchCourses({ pageSize: 500 })).rejects.toMatchObject({ status: 400 });
    await expect(getCourse("20260", "CSC 121")).rejects.toMatchObject({ status: 400 });
    await expect(getSection("abc", "20001")).rejects.toMatchObject({ status: 400 });
    await expect(countCourses("x")).rejects.toMatchObject({ status: 400 });
  });

  it("getCourse groups a code's sections; null when not offered", async () => {
    const course = CourseSchema.parse(await getCourse("202602", "csc 121"));
    expect(course.code).toBe("CSC 121");
    expect(course.sections.map((s) => s.section)).toEqual(["A", "B"]);
    expect(course.credits).toEqual([1]);
    expect(await getCourse("202602", "ZZZ 999")).toBeNull();
    expect(await getCourse("202602", "not a code")).toBeNull();
    const phy = await getCourse("202601", "PHY 214");
    expect(phy?.sections.map((s) => s.crossListings[0])).toEqual([
      { crn: "10227", courseCode: "ENV 214", section: "A" },
      { crn: "10228", courseCode: "ENV 214", section: "B" },
    ]);
  });

  it("serves a class's hidden registration-only listings, and flags topics courses", async () => {
    // CHE 430 A lists crn 20083 "REG FOR CHE 430-A" (BIO 395 A), a listing that is never in the public data.
    const che = CourseSchema.parse(await getCourse("202602", "CHE 430"));
    expect(che.sections[0]?.regFor).toBeNull();
    expect(che.sections[0]?.registrationSections).toEqual([
      { crn: "20083", courseCode: "BIO 395", section: "A" },
    ]);
    expect(che.topics).toBe(false);
    const crn = che.sections[0]!.crn;
    expect((await getSection("202602", crn))?.registrationSections).toHaveLength(1);
    expect((await getCourse("202602", "CSC 121"))?.sections[0]?.registrationSections).toEqual([]);
    // WRI 101: the sections' topics differ, so the course title is the neutral one.
    const wri = await getCourse("202602", "WRI 101");
    expect(wri).toMatchObject({ topics: true, title: "Writing Program: topics vary by section" });
    const [summary] = (await searchCourses({ q: "WRI 101" })).items;
    expect(summary).toMatchObject({ code: "WRI 101", topics: true });
    expect((await searchCourses({ q: "CSC 121" })).items[0]?.topics).toBe(false);
  });

  it("getSection finds a CRN", async () => {
    const section = SectionSchema.parse(await getSection("202602", "20001"));
    expect(section).toMatchObject({ courseCode: "AFR 101", section: "A" });
    expect(await getSection("202602", "99999")).toBeNull();
    expect(await getSection("202602", "abc")).toBeNull();
  });

  it("countCourses counts distinct codes", async () => {
    expect(await countCourses("202602")).toBe(
      new Set(fixtureSections("202602").map((s) => s.courseCode)).size,
    );
  });

  it("marks ingested terms published", async () => {
    await searchCourses({});
    const { terms } = await resolveTerms();
    expect(terms.find((t) => t.code === "202602")?.published).toBe(true);
  });
});

describe("browseTerm (the default term for browsing)", () => {
  it("is the registration term once its schedule is published, else the current term", async () => {
    expect(await browseTerm()).toBe("202602");
    expect(await browseTerm({ now: new Date("2026-12-20T17:00:00Z") })).toBe("202602");
    // 2027-02-01: current Spring 2027, registration Fall 2027, whose schedule upstream answers with [] for weeks.
    setNow("2027-02-01T10:00:00-05:00");
    const fetchPage: FetchSectionsPage = async (term, offset, options) =>
      term === "202701" ? [] : fetchSectionsPage(term, offset, options);
    setIngestDepsForTests({ fetchPage });
    expect(await resolveTerms()).toMatchObject({ current: "202602", registration: "202701" });
    expect(await browseTerm()).toBe("202602");
    // searchCourses without a term follows it; an explicit term is honoured.
    const result = await searchCourses({ q: "csc 121" });
    expect(result).toMatchObject({ term: "202602", total: 1 });
    expect(await searchCourses({ term: "202701" })).toMatchObject({ term: "202701", total: 0 });
  });
});

describe("validateCourseCodes", () => {
  it("canonicalises, dedupes and checks the ingested terms (current + registration at least)", async () => {
    expect(
      await validateCourseCodes(["csc121", "CSC 121", "PHY 214", "ENV 214", "ZZZ 999", "hello"]),
    ).toEqual({ valid: ["CSC 121", "PHY 214", "ENV 214"], invalid: ["ZZZ 999", "hello"] });
  });

  it("agrees with getCourse and getCourseHistory: a registration-only alias is not a course", async () => {
    await runCatalogCron();
    // BIO 395 A (crn 20083) is only named in CHE 430 A's reg_fors; no BIO 395 listing exists anywhere.
    expect(await validateCourseCodes(["BIO 395", "CHE 430"])).toEqual({
      valid: ["CHE 430"],
      invalid: ["BIO 395"],
    });
    expect(await getCourse("202602", "BIO 395")).toBeNull();
    expect((await getCourseHistory("BIO 395")).filter((a) => a.status === "offered")).toEqual([]);
    expect(await getCourse("202602", "CHE 430")).not.toBeNull();
    expect(await validateCourseCodes(["SOC 221", "SOC 330", "EDU 241"], ["202602"])).toEqual({
      valid: [],
      invalid: ["SOC 221", "SOC 330", "EDU 241"],
    });
    // Every valid code of the term has a course page there.
    const codes = fixtureSections("202602").map((section) => section.courseCode);
    const { valid } = await validateCourseCodes(codes, ["202602"]);
    for (const code of valid) expect(await getCourse("202602", code), code).not.toBeNull();
    // Search still finds the class for the alias.
    expect((await searchCourses({ q: "BIO 395" })).items.map((i) => i.code)).toEqual(["CHE 430"]);
  });

  it("limits to the given terms and knows every backfilled term", async () => {
    await runCatalogCron();
    expect(await validateCourseCodes(["HUM 103", "HUM 104"], ["202602"])).toEqual({
      valid: ["HUM 104"],
      invalid: ["HUM 103"],
    });
    expect(await validateCourseCodes(["HUM 103"], ["201901"])).toEqual({
      valid: [],
      invalid: ["HUM 103"],
    });
    const oldOnly = fixtureSections("202201").find(
      (s) =>
        !fixtureSections("202601").some((t) => t.courseCode === s.courseCode) &&
        !fixtureSections("202602").some((t) => t.courseCode === s.courseCode),
    );
    expect(oldOnly).toBeDefined();
    expect((await validateCourseCodes([oldOnly!.courseCode])).valid).toEqual([oldOnly!.courseCode]);
  });
});

describe("getCatalogFilters", () => {
  it("serves the upstream lists for the hot terms, cached in CatalogMeta", async () => {
    // A cold cache never blocks the page: the ingest's names now, the upstream lists once fetched.
    const first = CatalogFiltersSchema.parse(await getCatalogFilters("202602"));
    expect(first.departments).toContainEqual({ code: "AFR", name: "Africana Studies" });
    await drainBackground();
    const filters = CatalogFiltersSchema.parse(await getCatalogFilters("202602"));
    expect(filters.departments).toContainEqual({ code: "AFR", name: "Africana Studies" });
    expect(filters.departments).toContainEqual({ code: "IGEN", name: "Genomics" });
    expect(filters.requirements.map((r) => r.code).sort()).toEqual(
      [
        "COMP",
        "CULT",
        "FRLG",
        "HTRQ",
        "JEC",
        "LTRQ",
        "MQRQ",
        "NSRQ",
        "PRRQ",
        "SSRQ",
        "VPRQ",
      ].sort(),
    );
    expect(await CatalogMeta.findOne({ key: "filters:202602" }).lean()).toMatchObject({
      kind: "filters",
    });
  });

  it("fetches the upstream lists once, however many reads arrive (cold and stale)", async () => {
    await searchCourses({}); // load the term first
    let calls = 0;
    setFiltersFetchForTests(async (term, options) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return fetchFilters(term, options);
    });
    const cold = await Promise.all(Array.from({ length: 20 }, () => getCatalogFilters("202602")));
    await drainBackground();
    expect(calls).toBe(1);
    expect(cold.every((f) => f.term === "202602")).toBe(true);
    // A day later: stale, one background refresh for 20 concurrent reads, and none from another instance.
    resetCatalogState();
    setFiltersFetchForTests(async (term, options) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return fetchFilters(term, options);
    });
    setNow("2026-10-01T13:00:00-04:00");
    const stale = await Promise.all(Array.from({ length: 20 }, () => getCatalogFilters("202602")));
    expect(stale.every((f) => f.departments.some((d) => d.code === "IGEN"))).toBe(true);
    await drainBackground();
    expect(calls).toBe(2);
    // The claim is in the database: a second instance within 5 minutes does not ask upstream again.
    resetCatalogState();
    setFiltersFetchForTests(async (term, options) => {
      calls += 1;
      return fetchFilters(term, options);
    });
    await CatalogMeta.updateOne(
      { key: "filters:202602" },
      { $set: { lastSuccessAt: new Date("2026-09-29T00:00:00Z") } },
    );
    expect(await refreshFilters("202602")).toBeNull();
    expect(calls).toBe(2);
  });

  it("derives past terms' lists from their sections (no upstream call)", async () => {
    // There is no filters fixture for 202501: an upstream call would throw MissingFixtureError.
    const filters = await getCatalogFilters("202501");
    expect(filters.departments).toContainEqual({ code: "CSC", name: "Computer Science" });
    expect(filters.requirements).toContainEqual({ code: "LTRQ", name: expect.any(String) });
  });
});
