import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { insertLegacyPlan, insertStudent, legacyDocs, planDoc, withPlanDb } from "./helpers";
import { LegacyPlanConversionSchema } from "@/lib/types/plan";
import { AddPlanItemBodySchema } from "@/lib/api/plan";
import {
  addItem,
  addSummerActivity,
  getPlan,
  getPlanCredits,
  readLegacyPlan,
  removeItem,
  updateItem,
} from "@/server/plan";
import {
  convertLegacyPlan,
  derivedLegacyId,
  type LegacyCatalogLookup,
} from "@/server/plan/legacy-core";

/**
 * readLegacyPlan (PLAN §5): v1 (the hackathon `courseplans`) → v2 in memory, with every v1 shape the audit saw:
 * credits 4 on every entry, invented courseIds, mixed-case codes, Summer entries, AI-invented codes ("FAKE 999",
 * "ELEC ---", "HACK 1"), "Fall 1900", grades (F, Fail, Pass), the duplicate forced _id, repeated entries.
 * The v1 document is never written; v2 appears only with the student's first change.
 */

withPlanDb();

const USER = "650000000000000000000001";
const oid = (hex: string) => new mongoose.Types.ObjectId(hex);

/** A fake catalog: CSC 121 and WRI 101 in Fall 2025, CSC 221 anywhere; nothing else. */
const lookup: LegacyCatalogLookup = async (termCode, code) => {
  if (code === "CSC 221") {
    return {
      courseCode: code,
      canonicalCode: code,
      title: "Data Structures",
      credits: 1,
      reqCodes: ["MQRQ"],
    };
  }
  if (termCode === "202501" && code === "CSC 121") {
    return {
      courseCode: code,
      canonicalCode: code,
      title: "Programming & Problem Solving",
      credits: 1,
      reqCodes: ["MQRQ"],
    };
  }
  if (termCode === "202501" && code === "HUM 103") {
    return {
      courseCode: code,
      canonicalCode: code,
      title: "Connections and Conflicts I",
      credits: 2,
      reqCodes: ["NONE"],
    };
  }
  if (code === "BIO 331" || code === "PSY 303") {
    return {
      courseCode: code,
      canonicalCode: "BIO 331",
      title: "Psy Research: Behavioral Neuro",
      credits: 1,
      reqCodes: ["NONE"],
    };
  }
  return null;
};

const entry = (fields: Record<string, unknown>) => ({
  _id: new mongoose.Types.ObjectId(),
  courseId: new mongoose.Types.ObjectId(),
  credits: 4,
  status: "planned",
  ...fields,
});

describe("convertLegacyPlan (pure)", () => {
  it("maps semester + year to term codes and takes title and credits from the catalog", async () => {
    const id = oid("650000000000000000000a01");
    const { conversion, report } = await convertLegacyPlan(
      {
        plannedCourses: [
          entry({
            _id: id,
            courseCode: "csc 121",
            courseName: "Intro CS",
            semester: "Fall",
            year: 2025,
            status: "completed",
            grade: "A-",
          }),
          entry({
            courseCode: "CSC221",
            courseName: "Discrete Mathematics",
            semester: "Spring",
            year: 2027,
          }),
          entry({
            courseCode: "HUM 103",
            courseName: "Humanities",
            semester: "Fall",
            year: 2025,
            status: "completed",
          }),
        ],
        updatedAt: new Date("2026-03-01T12:00:00Z"),
      },
      { userId: USER, lookup },
    );
    expect(LegacyPlanConversionSchema.parse(conversion)).toEqual(conversion);
    expect(conversion.items).toEqual([
      {
        id: "650000000000000000000a01",
        termCode: "202501",
        courseCode: "CSC 121",
        canonicalCode: "CSC 121",
        title: "Programming & Problem Solving",
        credits: 1,
        status: "completed",
        passFail: false,
        source: "catalog",
        reqCodes: ["MQRQ"],
        unverified: false,
      },
      expect.objectContaining({
        termCode: "202602",
        courseCode: "CSC 221",
        title: "Data Structures",
        credits: 1,
      }),
      expect.objectContaining({ termCode: "202501", courseCode: "HUM 103", credits: 2 }),
    ]);
    // No grades and no courseId survive.
    for (const item of conversion.items) {
      expect(item).not.toHaveProperty("grade");
      expect(item).not.toHaveProperty("courseId");
    }
    expect(conversion.sourceUpdatedAt).toBe("2026-03-01T12:00:00.000Z");
    expect(report).toMatchObject({
      entries: 3,
      items: 3,
      verified: 3,
      unverified: 0,
      creditsNormalized: 3,
    });
  });

  it("keeps AI-invented but well-formed codes as unverified with credits 1 (never 4)", async () => {
    const { conversion, report } = await convertLegacyPlan(
      {
        plannedCourses: [
          entry({
            courseCode: "FAKE 999",
            courseName: "Machine Learning for Poets",
            semester: "Fall",
            year: 2026,
          }),
        ],
      },
      { userId: USER, lookup },
    );
    expect(conversion.items[0]).toMatchObject({
      courseCode: "FAKE 999",
      title: "Machine Learning for Poets",
      credits: 1,
      source: "manual",
      reqCodes: null,
      unverified: true,
    });
    expect(report).toMatchObject({ unverified: 1, creditsNormalized: 1 });
  });

  it("skips entries that are no course code or have no usable term, saying why", async () => {
    const { conversion, report } = await convertLegacyPlan(
      {
        plannedCourses: [
          entry({ courseCode: "ELEC ---", courseName: "Elective", semester: "Fall", year: 2026 }),
          entry({ courseCode: "HACK 1", semester: "Fall", year: 2026 }),
          entry({ courseCode: "CSC 221", semester: "Fall", year: 1900 }),
          entry({ courseCode: "CSC 221", semester: "Winter", year: 2026 }),
          entry({ courseCode: "CSC 221" }),
          { courseCode: "" },
        ],
      },
      { userId: USER, lookup },
    );
    expect(conversion.items).toEqual([]);
    expect(conversion.skipped).toEqual([
      { courseCode: "ELEC ---", reason: "Not a Davidson course code" },
      { courseCode: "HACK 1", reason: "Not a Davidson course code" },
      { courseCode: "CSC 221", reason: "No valid semester and year: Fall 1900" },
      { courseCode: "CSC 221", reason: "No valid semester and year: Winter 2026" },
      { courseCode: "CSC 221", reason: "No valid semester and year: ? ?" },
      { courseCode: "(blank)", reason: "Not a Davidson course code" },
    ]);
    expect(report.skipped).toMatchObject({ badCode: 3, noTerm: 3 });
  });

  it("turns grades into statuses (F/Fail → failed, W → withdrawn, Pass/Fail → P/F) and drops them", async () => {
    const { conversion, report } = await convertLegacyPlan(
      {
        plannedCourses: [
          entry({
            courseCode: "ECO 101",
            semester: "Fall",
            year: 2025,
            status: "completed",
            grade: "F",
          }),
          entry({
            courseCode: "PSY 101",
            semester: "Fall",
            year: 2025,
            status: "completed",
            grade: "Fail",
          }),
          entry({
            courseCode: "SOC 101",
            semester: "Spring",
            year: 2026,
            status: "completed",
            grade: "Pass",
          }),
          entry({
            courseCode: "POL 121",
            semester: "Spring",
            year: 2026,
            status: "completed",
            grade: "W",
          }),
          entry({
            courseCode: "MAT 110",
            semester: "Spring",
            year: 2026,
            status: "dropped",
            grade: "F",
          }),
          entry({ courseCode: "BIO 111", semester: "Fall", year: 2026, status: "in-progress" }),
          entry({ courseCode: "CHE 115", semester: "Fall", year: 2026, status: "bogus" }),
        ],
      },
      { userId: USER, lookup },
    );
    expect(conversion.items.map((i) => [i.courseCode, i.status, i.passFail])).toEqual([
      ["ECO 101", "failed", false],
      ["PSY 101", "failed", true],
      ["SOC 101", "completed", true],
      ["POL 121", "withdrawn", false],
      ["MAT 110", "dropped", false],
      ["BIO 111", "in-progress", false],
      ["CHE 115", "planned", false],
    ]);
    expect(report).toMatchObject({
      failedFromGrade: 2,
      withdrawnFromGrade: 1,
      passFailFromGrade: 2,
      statusDefaulted: 1,
    });
  });

  it("turns Summer entries and v1 summer activities into summer activities", async () => {
    const { conversion, report } = await convertLegacyPlan(
      {
        plannedCourses: [
          entry({
            courseCode: "csc 221",
            courseName: "Data Structures",
            semester: "Summer",
            year: 2026,
            notes: "at UNC",
          }),
        ],
        summerActivities: [
          {
            _id: new mongoose.Types.ObjectId(),
            title: "Research with Dr. Peck",
            description: "CS lab",
            summer: "Summer 2027",
            year: 2027,
          },
          { title: "Internship", summer: "Summer 2028" },
          { title: "", year: 2027 },
          { title: "Gap summer" },
        ],
      },
      { userId: USER, lookup },
    );
    expect(conversion.items).toEqual([]);
    expect(conversion.summer).toEqual([
      expect.objectContaining({
        termCode: "202503",
        title: "CSC 221 Data Structures",
        kind: "course",
        note: "at UNC",
      }),
      expect.objectContaining({
        termCode: "202603",
        title: "Research with Dr. Peck",
        kind: "other",
        note: "CS lab",
      }),
      expect.objectContaining({ termCode: "202703", title: "Internship", kind: "other" }),
    ]);
    expect(report).toMatchObject({ summerCourses: 1, summerActivities: 2 });
    expect(report.skipped).toMatchObject({ summerNoTitle: 1, summerNoYear: 1 });
  });

  it("merges exact duplicates (and cross-listed siblings in one term), keeping the furthest status", async () => {
    const { conversion, report } = await convertLegacyPlan(
      {
        plannedCourses: [
          entry({ courseCode: "CSC 221", semester: "Spring", year: 2027 }),
          entry({
            courseCode: "csc 221",
            semester: "Spring",
            year: 2027,
            status: "in-progress",
            notes: "second copy",
          }),
          entry({ courseCode: "CSC 221", semester: "Fall", year: 2027 }),
          entry({ courseCode: "BIO 331", semester: "Fall", year: 2025 }),
          entry({ courseCode: "PSY 303", semester: "Fall", year: 2025 }),
          entry({ courseCode: "ECO 101", semester: "Fall", year: 2025, status: "dropped" }),
          entry({ courseCode: "ECO 101", semester: "Fall", year: 2025, status: "dropped" }),
        ],
      },
      { userId: USER, lookup },
    );
    expect(conversion.items.map((i) => `${i.termCode} ${i.courseCode} ${i.status}`)).toEqual([
      "202602 CSC 221 in-progress",
      "202701 CSC 221 planned",
      "202501 BIO 331 planned",
      "202501 ECO 101 dropped",
    ]);
    expect(conversion.items[0]?.note).toBe("second copy");
    expect(conversion.skipped.map((s) => s.reason)).toEqual([
      "Duplicate entry (merged): same as CSC 221 in Spring 2027",
      "Duplicate entry (merged): same as BIO 331 in Fall 2025",
      "Duplicate entry (merged): same as ECO 101 in Fall 2025",
    ]);
    expect(report.skipped.duplicate).toBe(3);
  });

  it("keeps v1 subdocument ids, deriving deterministic ones when missing or reused", async () => {
    const forced = oid("000000000000000000000000");
    const doc = {
      plannedCourses: [
        entry({ _id: forced, courseCode: "CSC 121", semester: "Fall", year: 2025 }),
        entry({ _id: forced, courseCode: "MAT 150", semester: "Fall", year: 2025 }),
        { courseCode: "CSC 221", semester: "Spring", year: 2027, credits: 4 },
      ],
    };
    const first = await convertLegacyPlan(doc, { userId: USER, lookup });
    const second = await convertLegacyPlan(doc, { userId: USER, lookup });
    const ids = first.conversion.items.map((i) => i.id);
    expect(ids[0]).toBe("000000000000000000000000");
    expect(ids[1]).toBe(derivedLegacyId(USER, "item", 1));
    expect(ids[2]).toBe(derivedLegacyId(USER, "item", 2));
    expect(new Set(ids).size).toBe(3);
    expect(second.conversion.items.map((i) => i.id)).toEqual(ids);
    expect(first.report.idsDerived).toBe(2);
  });

  it("tolerates junk documents", async () => {
    const { conversion } = await convertLegacyPlan(
      { plannedCourses: "nope", summerActivities: [null, 3] },
      { userId: USER, lookup },
    );
    expect(conversion).toEqual({ items: [], summer: [], skipped: [], sourceUpdatedAt: null });
  });
});

describe("readLegacyPlan and the first change (with the real catalog)", () => {
  async function legacyStudent() {
    const user = await insertStudent({ graduationYear: 2028 });
    await insertLegacyPlan(user, {
      plannedCourses: [
        entry({
          _id: oid("650000000000000000000b01"),
          courseCode: "csc 121",
          courseName: "Intro to CS",
          semester: "Fall",
          year: 2025,
          status: "completed",
          grade: "B+",
        }),
        entry({
          _id: oid("650000000000000000000b02"),
          courseCode: "CSC 250",
          courseName: "Discrete Mathematics",
          semester: "Spring",
          year: 2026,
          status: "completed",
        }),
        entry({
          _id: oid("650000000000000000000b03"),
          courseCode: "FAKE 999",
          courseName: "AI Ethics",
          semester: "Fall",
          year: 2026,
          status: "in-progress",
        }),
        entry({
          _id: oid("650000000000000000000b04"),
          courseCode: "WRI 101",
          courseName: "Writing",
          semester: "Summer",
          year: 2026,
        }),
      ],
      summerActivities: [{ title: "Hurt Hub internship", summer: "Summer 2027", year: 2027 }],
    });
    return user;
  }

  it("converts in memory with catalog titles, and getPlan serves it as legacy", async () => {
    const user = await legacyStudent();
    const before = await legacyDocs();
    const conversion = await readLegacyPlan(user);
    expect(
      conversion?.items.map((i) => [
        i.id,
        i.termCode,
        i.courseCode,
        i.title,
        i.credits,
        i.unverified,
      ]),
    ).toEqual([
      ["650000000000000000000b01", "202501", "CSC 121", "Programming & Problem Solving", 1, false],
      ["650000000000000000000b02", "202502", "CSC 250", "Computer Organization", 1, false],
      ["650000000000000000000b03", "202601", "FAKE 999", "AI Ethics", 1, true],
    ]);
    expect(conversion?.summer.map((s) => [s.termCode, s.title, s.kind])).toEqual([
      ["202503", "WRI 101 Writing", "course"],
      ["202603", "Hurt Hub internship", "other"],
    ]);
    const plan = await getPlan(user);
    expect(plan).toMatchObject({ legacy: true, updatedAt: null, deadlines: [] });
    expect(plan.items).toEqual(conversion?.items);
    expect(await getPlanCredits(user)).toEqual({ done: 2, planned: 3, required: 32 });
    expect(await planDoc(user)).toBeNull();
    expect(await legacyDocs()).toEqual(before);
  });

  it("writes v2 on the first change only, keeping the legacy ids, and never touches v1", async () => {
    const user = await legacyStudent();
    const before = await legacyDocs();
    const added = await addItem(
      user,
      AddPlanItemBodySchema.parse({ termCode: "202602", courseCode: "CSC 221" }),
    );
    expect(added.warnings).toEqual([]);
    const plan = await getPlan(user);
    expect(plan.legacy).toBe(false);
    expect(plan.items.map((i) => i.id)).toEqual([
      "650000000000000000000b01",
      "650000000000000000000b02",
      "650000000000000000000b03",
      added.item.id,
    ]);
    expect(plan.summer).toHaveLength(2);
    const doc = await planDoc(user);
    expect(doc?.importedFromLegacy).toMatchObject({
      via: "first-mutation",
      sourceUpdatedAt: new Date("2026-03-01T12:00:00Z"),
    });
    // Later changes address the converted items by their ids.
    await updateItem(user, "650000000000000000000b03", { status: "dropped" });
    await removeItem(user, "650000000000000000000b02");
    expect((await getPlan(user)).items.map((i) => `${i.courseCode} ${i.status}`)).toEqual([
      "CSC 121 completed",
      "FAKE 999 dropped",
      "CSC 221 planned",
    ]);
    expect(await legacyDocs()).toEqual(before);
  });

  it("a first change that removes a converted item writes v2 without it", async () => {
    const user = await legacyStudent();
    await removeItem(user, "650000000000000000000b01");
    const plan = await getPlan(user);
    expect(plan.legacy).toBe(false);
    expect(plan.items.map((i) => i.id)).toEqual([
      "650000000000000000000b02",
      "650000000000000000000b03",
    ]);
  });

  it("a duplicate of a converted item is a 409 that writes nothing (v2 only for a real change)", async () => {
    const user = await legacyStudent();
    const before = await legacyDocs();
    const error = await addItem(
      user,
      AddPlanItemBodySchema.parse({
        termCode: "202501",
        courseCode: "CSC 121",
        status: "completed",
      }),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 409,
      message: "CSC 121 is already in your Fall 2025 plan.",
    });
    expect(await planDoc(user)).toBeNull();
    expect((await getPlan(user)).legacy).toBe(true);
    expect(await legacyDocs()).toEqual(before);
  });

  it("parallel first changes write one v2 document with every change", async () => {
    const user = await legacyStudent();
    await Promise.all([
      addItem(user, AddPlanItemBodySchema.parse({ termCode: "202602", courseCode: "CSC 221" })),
      addItem(user, AddPlanItemBodySchema.parse({ termCode: "202602", courseCode: "MAT 150" })),
      addSummerActivity(user, { termCode: "202703", title: "REU", kind: "research" }),
      addItem(user, AddPlanItemBodySchema.parse({ termCode: "202602", courseCode: "ECO 101" })),
    ]);
    const plan = await getPlan(user);
    expect(plan.items.map((i) => i.courseCode).sort()).toEqual(
      ["CSC 121", "CSC 221", "CSC 250", "ECO 101", "FAKE 999", "MAT 150"].sort(),
    );
    expect(plan.summer).toHaveLength(3);
  });

  it("v2 wins over v1; students without any plan get an empty v2 view", async () => {
    const user = await legacyStudent();
    await addItem(user, AddPlanItemBodySchema.parse({ termCode: "202602", courseCode: "CSC 221" }));
    await removeItem(user, "650000000000000000000b01");
    expect((await getPlan(user)).items.map((i) => i.courseCode)).not.toContain("CSC 121");
    const fresh = await insertStudent();
    expect(await readLegacyPlan(fresh)).toBeNull();
    expect(await readLegacyPlan("not-an-id")).toBeNull();
    expect(await getPlan(fresh)).toEqual({
      items: [],
      summer: [],
      deadlines: [],
      manual: { languageExempt: false, pe: { lifetimeActivities: 0, teamSport: false } },
      legacy: false,
      updatedAt: null,
    });
  });

  it("reads a v1 document whose userId was stored as a string", async () => {
    const user = await insertStudent();
    await mongoose.connection.db!.collection("courseplans").insertOne({
      userId: user,
      plannedCourses: [entry({ courseCode: "CSC 121", semester: "Fall", year: 2025 })],
    });
    expect((await readLegacyPlan(user))?.items.map((i) => i.courseCode)).toEqual(["CSC 121"]);
  });
});
