import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import type { CatalogSearchResult, CourseSummary } from "@/lib/types/catalog";
import { InstructorRatingSchema, RMP_DAVIDSON_SCHOOL_ID } from "@/lib/types/ratings";
import RmpTeacher from "@/models/RmpTeacher";
import type * as CatalogModule from "@/server/catalog";
import { searchCourses } from "@/server/catalog";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import type * as ExternalModule from "@/server/http/external";
import { fetchExternal } from "@/server/http/external";
import { getRatings, syncRoster } from "@/server/rmp";
import { catalogHomeSubjects, courseInstructors, getCourseRatings } from "@/server/rmp/course";
import type * as OverridesModule from "@/server/rmp/overrides";
import { instructor, makeCourse, makeSection } from "./helpers";

// Wrap fetchExternal so the tests can prove getRatings never calls RateMyProfessors per view.
vi.mock("@/server/http/external", async (importOriginal) => {
  const actual = await importOriginal<typeof ExternalModule>();
  return { ...actual, fetchExternal: vi.fn(actual.fetchExternal) };
});

// The stored roster is the synthetic fixture: use the override table written for its ids.
vi.mock("@/server/rmp/overrides", async (importOriginal) => {
  const actual = await importOriginal<typeof OverridesModule>();
  const { SYNTHETIC_OVERRIDES } = await import("./synthetic-overrides");
  return { ...actual, RMP_OVERRIDES: SYNTHETIC_OVERRIDES };
});

// W1 owns searchCourses (a 501 stub until it lands): by default call through; tests supply results.
vi.mock("@/server/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof CatalogModule>();
  return { ...actual, searchCourses: vi.fn(actual.searchCourses) };
});

function summary(code: string, instructorNames: string[], crossListings: string[] = []) {
  return {
    termCode: "202602",
    code,
    title: "Test course",
    topics: false,
    credits: [1],
    reqCodes: [],
    sectionCount: 1,
    openSeats: 5,
    instructorNames,
    crossListings,
    hasTba: false,
  } satisfies CourseSummary;
}

function searchResult(items: CourseSummary[]): CatalogSearchResult {
  return { term: "202602", items, total: items.length, page: 1, pageSize: 100, asOf: null };
}

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(async () => {
  await testDb.clear();
  expect((await syncRoster()).ok).toBe(true);
  vi.mocked(fetchExternal).mockClear();
});

afterAll(async () => {
  await testDb.stop();
});

describe("getRatings", () => {
  it("answers one rating per instructor, in order, from the stored roster only", async () => {
    const people = [
      instructor("Christopher", "Alexander"),
      instructor("S", "Staff", true),
      instructor("Fred", "Smith"),
      instructor("Hilary", "Green"),
      instructor("Fred", "Smith"),
    ];
    const ratings = await getRatings(people, { subject: "CHE" });
    expect(ratings.map((r) => r.status)).toEqual([
      "review",
      "staff",
      "matched",
      "unmatched",
      "matched",
    ]);
    expect(ratings.map((r) => r.instructor)).toEqual(people);
    for (const rating of ratings) InstructorRatingSchema.parse(rating);
    expect(fetchExternal).not.toHaveBeenCalled();
  });

  it("returns the RMP fields, the profile link and the roster's sync time as 'as of'", async () => {
    const [fred, alesha] = await getRatings(
      [instructor("Fred", "Smith"), instructor("Alesha", "Bond")],
      { subject: "ECO", relatedSubjects: ["PSY"] },
    );
    expect(fred).toEqual({
      instructor: instructor("Fred", "Smith"),
      status: "matched",
      rmp: {
        legacyId: 9000001,
        avgRating: 2,
        numRatings: 41,
        avgDifficulty: 1.5,
        wouldTakeAgainPct: 0.5,
        department: "Economics",
        url: "https://www.ratemyprofessors.com/professor/9000001",
        asOf: now().toISOString(),
      },
    });
    // RMP's -1 ("nobody answered") is stored and served as null; zero ratings still match.
    expect(alesha?.rmp).toMatchObject({
      legacyId: 9000021,
      numRatings: 0,
      wouldTakeAgainPct: null,
    });
  });

  it("uses the subject for department agreement (THE ↔ Fine Arts; CHE vs Political Science)", async () => {
    const [green] = await getRatings([instructor("Sharon", "Green")], { subject: "THE" });
    expect(green?.rmp?.legacyId).toBe(9000009);
    const [alexander] = await getRatings([instructor("Christopher", "Alexander")], {
      subject: "POL",
    });
    expect(alexander?.rmp?.legacyId).toBe(9000023);
    const [bullock] = await getRatings([instructor("Graham", "Bullock")], {
      subject: "ENV",
    });
    expect(bullock?.rmp?.legacyId).toBe(9000031);
    const [hales] = await getRatings([instructor("Karen", "Hales")], { subject: "bio" });
    expect(hales?.rmp?.legacyId).toBe(9000028);
  });

  it("applies the override table (Lengxob Yong → Lenny Yong, loaded by legacyId)", async () => {
    const [yong, gouri] = await getRatings(
      [instructor("Lengxob", "Yong"), instructor("Shyam", "Gouri Suresh")],
      { subject: "BIO", relatedSubjects: ["SOU"] },
    );
    expect(yong).toMatchObject({ status: "matched", rmp: { legacyId: 9000026 } });
    expect(gouri).toMatchObject({ status: "matched", rmp: { legacyId: 9000018 } });
  });

  it("finds candidates by any surname token and by the one-word surname", async () => {
    const ratings = await getRatings(
      [
        instructor("Onita", "Vaz"),
        instructor("Tara", "Keith"),
        instructor("Katie", "St. Clair"),
        instructor("Andrew", "O’Geen"),
        instructor("Shyam", "Gouri Suresh"),
        instructor("Rachid", "El-Bejjani"),
      ],
      { subject: "ENG", relatedSubjects: ["MUS", "ART", "POL", "ECO", "BIO"] },
    );
    expect(ratings.map((r) => r.rmp?.legacyId)).toEqual([
      9000013, 9000014, 9000016, 9000020, 9000018, 9000015,
    ]);
  });

  it("strips extra instructor fields from the answer", async () => {
    const withExtras = { ...instructor("Fred", "Smith"), campus_id: "AUTHORIZATION_REQUIRED" };
    const [fred] = await getRatings([withExtras], { subject: "ECO" });
    expect(fred?.instructor).toEqual(instructor("Fred", "Smith"));
  });

  it("is 'unmatched' for everyone before the first roster sync", async () => {
    await testDb.clear();
    const ratings = await getRatings([instructor("Fred", "Smith")], { subject: "ECO" });
    expect(ratings).toEqual([{ instructor: instructor("Fred", "Smith"), status: "unmatched" }]);
  });

  it("never serves a stored row that fails the rating schema", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await RmpTeacher.collection.updateOne({ legacyId: 9000001 }, { $set: { avgRating: 9 } });
    const [fred] = await getRatings([instructor("Fred", "Smith")], { subject: "ECO" });
    expect(fred?.status).toBe("unmatched");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("9000001"));
  });

  it("ignores (and logs) malformed stored rows instead of failing every lookup", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const base = {
      rmpId: "raw",
      normalizedFirst: "x",
      normalizedLast: "smith",
      nameTokens: ["smith"],
      department: "Economics",
      schoolId: RMP_DAVIDSON_SCHOOL_ID,
      avgRating: 3,
      avgDifficulty: 3,
      numRatings: 99,
      wouldTakeAgainPct: null,
    };
    // Written around the model: no fetchedAt; no firstName; a string where a number belongs.
    await RmpTeacher.collection.insertMany([
      { ...base, rmpId: "raw-1", legacyId: 9900001, firstName: "Fred", lastName: "Smith" },
      {
        ...base,
        rmpId: "raw-2",
        legacyId: 9900002,
        lastName: "Smith",
        fetchedAt: new Date(),
      },
      {
        ...base,
        rmpId: "raw-3",
        legacyId: 9900003,
        firstName: "Kevin",
        lastName: "Smith",
        numRatings: "many",
        fetchedAt: new Date(),
      },
    ]);
    const ratings = await getRatings([instructor("Fred", "Smith"), instructor("Kevin", "Smith")], {
      subject: "ECO",
      relatedSubjects: ["BIO"],
    });
    expect(ratings.map((r) => r.rmp?.legacyId)).toEqual([9000001, 9000002]);
    for (const id of ["9900001", "9900002", "9900003"]) {
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(id));
    }
  });

  it("answers 'disabled' for everyone with RMP_ENABLED=false, without reading the roster", async () => {
    vi.stubEnv("RMP_ENABLED", "false");
    const find = vi.spyOn(RmpTeacher, "find");
    const ratings = await getRatings(
      [instructor("Fred", "Smith"), instructor("S", "Staff", true)],
      { subject: "ECO" },
    );
    expect(ratings.map((r) => r.status)).toEqual(["disabled", "disabled"]);
    expect(ratings.every((r) => r.rmp === undefined)).toBe(true);
    expect(find).not.toHaveBeenCalled();
    expect(fetchExternal).not.toHaveBeenCalled();
  });

  it("does not query the roster when every instructor is Staff", async () => {
    const find = vi.spyOn(RmpTeacher, "find");
    expect(await getRatings([instructor("S", "Staff", true)])).toEqual([
      { instructor: instructor("S", "Staff", true), status: "staff" },
    ]);
    expect(await getRatings([])).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it("only ever holds Davidson rows", async () => {
    expect(
      await RmpTeacher.countDocuments({ schoolId: trusted({ $ne: RMP_DAVIDSON_SCHOOL_ID }) }),
    ).toBe(0);
    expect(await RmpTeacher.countDocuments({ schoolId: RMP_DAVIDSON_SCHOOL_ID })).toBe(31);
  });
});

describe("instructors of all-interdisciplinary courses (WRI, HUM, ...)", () => {
  const wri = makeCourse("WRI 101", [
    makeSection({
      courseCode: "WRI 101",
      instructors: [
        instructor("Christopher", "Alexander"),
        instructor("Tim", "Chartier"),
        instructor("Sharon", "Green"),
      ],
    }),
  ]);

  it("never match a specific-department profile by nickname alone; the catalog settles it", async () => {
    // Default resolver: the real catalog search (fixtures). Tim Chartier teaches MAT/CSC this term, which agrees with
    // RMP 'Timothy Chartier' (Mathematics) → matched. Christopher Alexander's CHE sections conflict with RMP
    // 'Chris Alexander' (Political Science) → review. Sharon Green is an exact name.
    const ratings = await getCourseRatings(wri);
    expect(ratings.map((r) => [r.instructor.last, r.status, r.rmp?.legacyId])).toEqual([
      ["Alexander", "review", undefined],
      ["Chartier", "matched", 9000025],
      ["Green", "matched", 9000009],
    ]);
    expect(ratings[0]?.rmp).toBeUndefined();
  });

  it("are settled by their other sections in the term, looked up only when needed", async () => {
    const home = vi.fn(async (who: { last: string }) =>
      who.last === "Alexander" ? ["CHE", "WRI"] : who.last === "Chartier" ? ["MAT"] : [],
    );
    const ratings = await getCourseRatings(wri, { homeSubjects: home });
    expect(ratings.map((r) => [r.instructor.last, r.status, r.rmp?.legacyId])).toEqual([
      // Chris Alexander (Political Science) vs his CHE sections: a true conflict.
      ["Alexander", "review", undefined],
      ["Chartier", "matched", 9000025],
      ["Green", "matched", 9000009],
    ]);
    // Sharon Green's exact name needs no lookup.
    expect(home.mock.calls.map(([who]) => who.last)).toEqual(["Alexander", "Chartier"]);
  });

  it("stay review when the lookup finds nothing, and can be switched off", async () => {
    const ratings = await getCourseRatings(wri, { homeSubjects: async () => null });
    expect(ratings.map((r) => r.status)).toEqual(["review", "review", "matched"]);
    const off = await getCourseRatings(wri, { homeSubjects: null });
    expect(off.map((r) => r.status)).toEqual(["review", "review", "matched"]);
    expect(searchCourses).not.toHaveBeenCalled();
  });

  it("catalogHomeSubjects reads the catalog search for courses naming the instructor", async () => {
    vi.mocked(searchCourses).mockResolvedValue(
      searchResult([
        summary("CHE 250", ["Christopher Alexander"]),
        summary("ENV 322", ["Onita Vaz", "Christopher  Alexander"], ["BIO 322"]),
        summary("HIS 101", ["Alexander Hamilton"]),
        summary("PHI 101", ["Chris Alexander"]),
        summary("MAT 110", ["Tim Chartier"]),
      ]),
    );
    const resolve = catalogHomeSubjects("202602");
    expect(await resolve(instructor("Christopher", "Alexander"))).toEqual(["BIO", "CHE", "ENV"]);
    expect(searchCourses).toHaveBeenCalledWith({
      term: "202602",
      q: "Christopher Alexander",
      pageSize: 100,
    });
    // Through getCourseRatings (the default resolver, for the sections' term): Alexander's CHE sections conflict
    // with RMP's Political Science → review; Chartier's MAT section agrees with Mathematics → matched.
    const ratings = await getCourseRatings(wri);
    expect(ratings.map((r) => [r.status, r.rmp?.legacyId])).toEqual([
      ["review", undefined],
      ["matched", 9000025],
      ["matched", 9000009],
    ]);
  });

  it("catalogHomeSubjects answers null when the catalog cannot say, and never hides bugs", async () => {
    const resolve = catalogHomeSubjects("202602");
    vi.mocked(searchCourses).mockRejectedValueOnce(
      new ApiError(503, "unavailable", "Course data is temporarily unavailable."),
    );
    expect(await resolve(instructor("Tim", "Chartier"))).toBeNull();
    vi.mocked(searchCourses).mockRejectedValueOnce(new TypeError("bug"));
    await expect(resolve(instructor("Tim", "Chartier"))).rejects.toThrow("bug");
    expect(await resolve(instructor("", " "))).toBeNull();
  });
});

describe("course ratings (server/rmp/course.ts)", () => {
  const course = makeCourse("ENV 322", [
    makeSection({
      courseCode: "ENV 322",
      crn: "20101",
      instructors: [instructor("Andrew", "O'Geen"), instructor("S", "Staff", true)],
      crossListings: [{ crn: "20102", courseCode: "POL 322", section: "A" }],
      crossPostings: ["ENV", "POL"],
    }),
    makeSection({
      courseCode: "ENV 322",
      crn: "20103",
      section: "B",
      instructors: [
        instructor("Andrew", "O’Geen"),
        instructor("Graham", "Bullock"),
        instructor("S", "Staff", true),
      ],
      crossPostings: ["PPE"],
    }),
  ]);

  it("lists distinct instructors in upstream order, Staff once, with the course's other subjects", () => {
    expect(courseInstructors(course)).toEqual({
      instructors: [
        instructor("Andrew", "O'Geen"),
        instructor("S", "Staff", true),
        instructor("Graham", "Bullock"),
      ],
      subject: "ENV",
      relatedSubjects: ["POL", "PPE"],
    });
  });

  it("rates them with the course's subjects", async () => {
    const ratings = await getCourseRatings(course);
    expect(ratings.map((r) => [r.instructor.last, r.status, r.rmp?.legacyId])).toEqual([
      ["O'Geen", "matched", 9000020],
      ["Staff", "staff", undefined],
      // Environmental Studies agrees with ENV, Political Science with the POL cross-listing: one person, most
      // ratings wins.
      ["Bullock", "matched", 9000030],
    ]);
  });
});
