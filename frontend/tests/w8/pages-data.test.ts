import { describe, expect, it, vi } from "vitest";
import {
  chooseSection,
  latestOffered,
  loadCoursePage,
  parseCourseParams,
  resolveCoursePage,
} from "@/app/(hub)/courses/_lib/course";
import { parseCoursesQuery } from "@/app/(hub)/courses/_lib/query";
import { loadSearch, termOptions } from "@/app/(hub)/courses/_lib/search";
import { loadStudentPlan } from "@/app/(hub)/courses/_lib/student";
import { now } from "@/server/clock";
import { resolveTerms } from "@/server/catalog";
import { addItem } from "@/server/plan";
import { insertStudent, withPlanDb } from "../plan/helpers";
import { planItem } from "./helpers";

/**
 * The course pages' server data (app/(hub)/courses/_lib/{search,course}.ts) against the fixture catalog ingested
 * through the real services (fixtures mode, server "now" 2026-09-30: current Fall 2026, registration Spring 2027)
 * and the real plan service.
 */

withPlanDb();

async function plannedStudent() {
  const userId = await insertStudent({ graduationYear: 2028 });
  await addItem(userId, {
    termCode: "202602",
    courseCode: "BIO 201",
    crn: "20060",
    status: "planned",
    passFail: false,
    source: "catalog",
  });
  return userId;
}

describe("/courses data", () => {
  it("defaults to the registration term and lists its courses with sections and requirements", async () => {
    const { query } = parseCoursesQuery({ q: "data structures" });
    const view = await loadSearch(query, null);
    expect(view.term).toBe("202602");
    expect(view.window).toEqual({ current: "202601", registration: "202602" });
    expect(view.error).toBeNull();
    const row = view.rows.find((r) => r.summary.code === "CSC 221")!;
    expect(row.href).toBe("/courses/202602/CSC-221");
    expect(row.reqs).toEqual([{ code: "MQRQ", name: "Mathematical and Quantitative Thought" }]);
    expect(row.sections.map((s) => [s.section, s.times])).toEqual([
      ["A", ["MWF 10:30a–11:20a"]],
      ["B", ["MWF 11:30a–12:20p"]],
    ]);
    expect(row.add?.terms.map((t) => [t.code, t.availability])).toEqual([
      ["202601", "offered"],
      ["202602", "offered"],
      ["202701", "not-yet-published"],
    ]);
    expect(row.add?.initialTerm).toBe("202602");
    expect(view.termOptions[0]).toEqual({ code: "202602", label: "Spring 2027 (registration)" });
    expect(view.filters?.departments.some((d) => d.code === "CSC")).toBe(true);
  });

  it("filters (department, days free, open seats) and pages", async () => {
    const { query } = parseCoursesQuery({ dept: "CSC", days: ["M", "W", "F"], openOnly: "true" });
    const view = await loadSearch(query, null);
    expect(view.rows.length).toBeGreaterThan(0);
    // dept matches the course's departments (cross-postings included: W1's rule), so mostly CSC codes.
    expect(view.rows.some((r) => r.summary.code === "CSC 221")).toBe(true);
    expect(view.rows.every((r) => r.summary.openSeats > 0)).toBe(true);
    const all = await loadSearch(parseCoursesQuery({}).query, null);
    expect(all.result!.total).toBeGreaterThan(20);
    expect(all.rows).toHaveLength(20);
    const second = await loadSearch(parseCoursesQuery({ page: "2" }).query, null);
    expect(second.rows[0]!.summary.code).not.toBe(all.rows[0]!.summary.code);
  });

  it("searches another term from the selector", async () => {
    const view = await loadSearch(parseCoursesQuery({ term: "202601", q: "CSC 221" }).query, null);
    expect(view.term).toBe("202601");
    expect(view.rows[0]?.href).toBe("/courses/202601/CSC-221");
    expect(view.termOptions.map((t) => t.code)).toContain("202601");
  });

  it("labels a topics course and lists its sections' own titles", async () => {
    const view = await loadSearch(parseCoursesQuery({ q: "WRI 101" }).query, null);
    const wri = view.rows.find((r) => r.summary.code === "WRI 101")!;
    expect(wri.summary.topics).toBe(true);
    expect(wri.summary.title).toMatch(/topics vary by section$/);
    expect(wri.sections[0]!.title).not.toBe(wri.summary.title);
  });

  it("shows the plan's state and warnings on a row", async () => {
    const userId = await plannedStudent();
    const plan = await loadStudentPlan(userId, now());
    expect(plan).not.toBeNull();
    const view = await loadSearch(parseCoursesQuery({ q: "data structures" }).query, plan);
    const csc = view.rows.find((r) => r.summary.code === "CSC 221")!;
    expect(csc.add?.warnings["202602"]).toEqual([
      expect.stringMatching(/^CSC 221 A overlaps BIO 201 A .*another section fits\.$/),
    ]);
    const bio = (await loadSearch(parseCoursesQuery({ q: "BIO 201" }).query, plan)).rows.find(
      (r) => r.summary.code === "BIO 201",
    )!;
    expect(bio.add?.inPlanTerms).toEqual(["202602"]);
  });

  it("orders the term options newest first and tags current and registration", async () => {
    const resolved = await resolveTerms();
    const options = termOptions(resolved, "202602");
    expect(options.find((o) => o.code === "202601")?.label).toBe("Fall 2026 (current)");
    const codes = options.map((o) => o.code);
    expect([...codes].sort().reverse()).toEqual(codes);
  });
});

describe("/courses/[term]/[code] data", () => {
  it("parses the URL segments", () => {
    expect(parseCourseParams("202602", "CSC-221")).toEqual({ term: "202602", code: "CSC 221" });
    expect(parseCourseParams("202602", "csc-221")).toEqual({ term: "202602", code: "CSC 221" });
    expect(parseCourseParams("000001", "CSC-221")).toBeNull();
    expect(parseCourseParams("202602", "CSC221X9")).toBeNull();
    expect(parseCourseParams("2026", "CSC-221")).toBeNull();
  });

  it("is a 404 for a code the schedule never had or a term the catalog does not know", async () => {
    await expect(resolveCoursePage({ term: "202602", code: "XYZ 999" })).resolves.toBeNull();
    await expect(resolveCoursePage({ term: "199001", code: "CSC 221" })).resolves.toBeNull();
  });

  it("resolves an offered course with its term's as-of time", async () => {
    const page = await resolveCoursePage({ term: "202602", code: "CSC 221" });
    expect(page?.course?.sections.map((s) => s.section)).toEqual(["A", "B"]);
    expect(page?.entry).toMatchObject({ status: "offered", sectionCount: 2 });
    expect(page?.asOf).toEqual(expect.any(String));
  });

  it("shows a course that is not on this term's schedule from its latest offering", async () => {
    const page = await resolveCoursePage({ term: "202602", code: "HIS 357" });
    expect(page?.course).toBeNull();
    expect(page?.entry?.status).toBe("not-offered");
    expect(page?.reference.termCode).toBe("202601");
    const unpublished = await resolveCoursePage({ term: "202701", code: "CSC 221" });
    expect(unpublished?.entry?.status).toBe("not-yet-published");
    expect(unpublished?.reference.termCode).toBe("202602");
  });

  it("picks the requested, then the planned, then the first section", async () => {
    const page = (await resolveCoursePage({ term: "202602", code: "CSC 221" }))!;
    const course = page.course!;
    expect(chooseSection(course, "20136", [])?.section).toBe("B");
    expect(chooseSection(course, "99999", [])?.section).toBe("A");
    expect(
      chooseSection(course, null, [planItem({ courseCode: "CSC 221", crn: "20136" })])?.section,
    ).toBe("B");
    expect(latestOffered(page.history)).toBe("202602");
    expect(latestOffered(page.history, "202602")).toBe("202601");
  });

  it("loads the week grid, conflicts, add terms and warnings for a student", async () => {
    const userId = await plannedStudent();
    const plan = await loadStudentPlan(userId, now());
    const page = (await resolveCoursePage({ term: "202602", code: "CSC 221" }))!;
    const data = await loadCoursePage(page, { userId, requestedCrn: null, plan });
    expect(data.chosen?.section).toBe("A");
    expect(data.departmentName).toBe("Computer Science");
    expect(data.week?.view.chosenTentative).toBe(true);
    expect(data.week?.view.chosenConflicts.length).toBeGreaterThan(0);
    expect(data.week?.view.blocks.some((b) => b.code === "BIO 201 A")).toBe(true);
    expect(data.add.crns).toEqual({ "202602": "20135" });
    expect(data.add.sectionLabels).toEqual({ "202602": "CSC 221 A" });
    expect(data.add.warnings["202602"]).toEqual([expect.stringMatching(/^CSC 221 A overlaps/)]);
    expect(data.add.initialTerm).toBe("202602");
    expect(data.programs).toMatchObject({ matches: [] });
    // Section B fits: no warning, no conflict.
    const b = await loadCoursePage(page, { userId, requestedCrn: "20136", plan });
    expect(b.add.warnings).toEqual({});
    expect(b.week?.view.chosenConflicts).toEqual([]);
  });

  it("lists plan items without a section under the grid", async () => {
    const userId = await insertStudent({ graduationYear: 2028 });
    await addItem(userId, {
      termCode: "202602",
      courseCode: "ECO 101",
      status: "planned",
      passFail: false,
      source: "catalog",
    });
    const plan = await loadStudentPlan(userId, now());
    const page = (await resolveCoursePage({ term: "202602", code: "CSC 221" }))!;
    const data = await loadCoursePage(page, { userId, requestedCrn: null, plan });
    expect(data.week?.unplaced.map((i) => i.courseCode)).toEqual(["ECO 101"]);
  });

  it("hides the AI panel while AI is not configured, and asks an unverified student to verify", async () => {
    const userId = await insertStudent();
    const page = (await resolveCoursePage({ term: "202602", code: "CSC 221" }))!;
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await loadCoursePage(page, { userId, requestedCrn: null, plan: null })).aboutGate).toBe(
      null,
    );
    vi.stubEnv("AI_PROVIDER", "mock");
    expect((await loadCoursePage(page, { userId, requestedCrn: null, plan: null })).aboutGate).toBe(
      "unverified",
    );
    vi.stubEnv("AI_ENABLED", "false");
    expect((await loadCoursePage(page, { userId, requestedCrn: null, plan: null })).aboutGate).toBe(
      null,
    );
  });

  it("reads no ratings while RMP is off", async () => {
    vi.stubEnv("RMP_ENABLED", "false");
    const userId = await insertStudent();
    const page = (await resolveCoursePage({ term: "202602", code: "CSC 221" }))!;
    expect((await loadCoursePage(page, { userId, requestedCrn: null, plan: null })).ratings).toBe(
      null,
    );
  });
});

describe("warnings before an add, in every term the control offers", () => {
  async function completedStudent(code: string) {
    const userId = await insertStudent({ graduationYear: 2028 });
    await addItem(userId, {
      termCode: "202501",
      courseCode: code,
      status: "completed",
      passFail: false,
      source: "catalog",
    });
    return userId;
  }

  it("course page: the retake shows for each term, and matches what addItem then says", async () => {
    const userId = await completedStudent("CSC 121");
    const plan = await loadStudentPlan(userId, now());
    const page = (await resolveCoursePage({ term: "202602", code: "CSC 121" }))!;
    const data = await loadCoursePage(page, { userId, requestedCrn: null, plan });
    const retake = "Already completed in Fall 2025 — plan a retake?";
    expect(data.add.terms.map((t) => t.code)).toEqual(["202601", "202602", "202701"]);
    for (const term of ["202601", "202602", "202701"]) {
      expect(data.add.warnings[term]).toContain(retake);
    }
    const added = await addItem(userId, {
      termCode: "202701",
      courseCode: "CSC 121",
      status: "planned",
      passFail: false,
      source: "catalog",
    });
    expect(added.warnings.map((w) => w.message)).toContain(retake);
  });

  it("course page: a copy planned in another term is warned about before the add too", async () => {
    const userId = await insertStudent({ graduationYear: 2028 });
    await addItem(userId, {
      termCode: "202701",
      courseCode: "CSC 221",
      status: "planned",
      passFail: false,
      source: "catalog",
    });
    const plan = await loadStudentPlan(userId, now());
    const page = (await resolveCoursePage({ term: "202602", code: "CSC 221" }))!;
    const data = await loadCoursePage(page, { userId, requestedCrn: "20136", plan });
    const copy = data.add.warnings["202602"];
    expect(copy).toEqual([expect.stringMatching(/^CSC 221 is also in your Fall 2027 plan/)]);
    const added = await addItem(userId, {
      termCode: "202602",
      courseCode: "CSC 221",
      crn: "20136",
      status: "planned",
      passFail: false,
      source: "catalog",
    });
    expect(added.warnings.map((w) => w.message)).toEqual(copy);
  });

  it("search: rows of a term outside the plan window key their warnings to the terms offered", async () => {
    const userId = await completedStudent("CSC 221");
    const plan = await loadStudentPlan(userId, now());
    const view = await loadSearch(parseCoursesQuery({ term: "202601", q: "CSC 221" }).query, plan);
    const row = view.rows.find((r) => r.summary.code === "CSC 221")!;
    const offered = row.add!.terms.map((t) => t.code);
    expect(Object.keys(row.add!.warnings).sort()).toEqual([...offered].sort());
    expect(row.add!.warnings["202701"]).toEqual([
      "Already completed in Fall 2025 — plan a retake?",
    ]);
  });

  it("course page: register-as links resolve the sibling with its CRN", async () => {
    const page = (await resolveCoursePage({ term: "202601", code: "ENV 214" }))!;
    const data = await loadCoursePage(page, {
      userId: await insertStudent(),
      requestedCrn: null,
      plan: null,
    });
    const a = data.course!.sections.find((s) => s.section === "A")!;
    expect(data.registerAs[a.crn]).toMatchObject({
      label: "PHY 214 A",
      href: expect.stringMatching(/^\/courses\/202601\/PHY-214\?crn=\d+$/),
    });
  });

  it("search: a past term before the history window says the schedule isn't kept", async () => {
    const view = await loadSearch(parseCoursesQuery({ term: "202102" }).query, null);
    expect(view.unavailableBefore).toBe("202201");
    const current = await loadSearch(parseCoursesQuery({}).query, null);
    expect(current.unavailableBefore).toBeNull();
  });
});
