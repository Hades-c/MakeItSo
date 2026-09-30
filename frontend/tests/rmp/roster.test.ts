import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { RMP_DAVIDSON_SCHOOL_ID, RosterSyncResultSchema } from "@/lib/types/ratings";
import RmpTeacher from "@/models/RmpTeacher";
import SourceSync from "@/models/SourceSync";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { MissingFixtureError } from "@/server/http/fixtures";
import {
  parseRosterPage,
  ROSTER_MAX_PAGES,
  ROSTER_PAGE_SIZE,
  ROSTER_QUERY,
  RosterError,
  rosterRequestBody,
  runRosterSync,
} from "@/server/rmp/roster";
import { rosterPage, teacherNode, useRosterFixtures } from "./fixture-dir";
import { readFixtureJson } from "./helpers";

describe("the roster request", () => {
  it("asks newSearch.teachers for Davidson with an empty text query, 1000 per page", () => {
    expect(rosterRequestBody(null)).toEqual({
      query: ROSTER_QUERY,
      variables: { query: { text: "", schoolID: RMP_DAVIDSON_SCHOOL_ID }, first: 1000 },
    });
    expect(ROSTER_PAGE_SIZE).toBe(1000);
    expect(rosterRequestBody("YXJyYXk=").variables).toMatchObject({ after: "YXJyYXk=" });
    expect(RMP_DAVIDSON_SCHOOL_ID).toBe("U2Nob29sLTM5NjU=");
  });

  it("requests exactly the roster fields: no review text, no ratings list", () => {
    for (const field of [
      "newSearch",
      "teachers(query: $query, first: $first, after: $after)",
      "pageInfo { hasNextPage endCursor }",
      "id",
      "legacyId",
      "firstName",
      "lastName",
      "department",
      "avgRating",
      "avgDifficulty",
      "numRatings",
      "wouldTakeAgainPercent",
      "school { id }",
    ]) {
      expect(ROSTER_QUERY).toContain(field);
    }
    expect(ROSTER_QUERY).not.toMatch(/ratings\s*\{|comment|ratingTags|teacherRatingTags/i);
  });
});

describe("parseRosterPage", () => {
  const fixture = readFixtureJson("ratemyprofessors", "teachers-davidson.json");

  it("keeps Davidson nodes, rejects other schools and normalises names", () => {
    const page = parseRosterPage(fixture);
    expect(page).toMatchObject({ rejectedOtherSchool: 2, invalid: 0, hasNextPage: false });
    expect(page.rows).toHaveLength(31);
    expect(page.rows.every((row) => row.schoolId === RMP_DAVIDSON_SCHOOL_ID)).toBe(true);
    expect(page.rows.map((row) => row.legacyId)).not.toContain(9000010);
    const bond = page.rows.find((row) => row.legacyId === 9000021)!;
    expect(bond).toMatchObject({
      firstName: "Alesha",
      lastName: "Bond",
      normalizedFirst: "alesha",
      normalizedLast: "bond",
      wouldTakeAgainPct: null,
    });
    const ogeen = page.rows.find((row) => row.legacyId === 9000020)!;
    expect(ogeen).toMatchObject({ lastName: "O''Geen", normalizedLast: "ogeen" });
    expect(page.rows.find((row) => row.legacyId === 9000013)!.nameTokens).toEqual([
      "onita",
      "vaz",
      "hooper",
      "vazhooper",
    ]);
    expect(page.rows.find((row) => row.legacyId === 9000001)).toMatchObject({
      rmpId: "VGVhY2hlci05MDAwMDAx",
      department: "Economics",
      avgRating: 2,
      avgDifficulty: 1.5,
      numRatings: 41,
      wouldTakeAgainPct: 0.5,
    });
  });

  it("drops malformed nodes and nodes without a school, and counts them", () => {
    const page = parseRosterPage(
      rosterPage([
        teacherNode("Ok", "Person"),
        teacherNode("Bad", "Rating", { avgRating: 7 }),
        teacherNode("No", "Id", { legacyId: "x" }),
        teacherNode("No", "School", { school: null }),
        teacherNode("   ", "Blank"),
        teacherNode("Other", "School", { school: { id: "U2Nob29sLTE=" } }),
        "not a node",
      ]),
    );
    expect(page.rows.map((row) => row.firstName)).toEqual(["Ok"]);
    expect(page.invalid).toBe(5);
    expect(page.rejectedOtherSchool).toBe(1);
  });

  it("throws RosterError for GraphQL errors and unexpected shapes", () => {
    expect(() =>
      parseRosterPage({ data: null, errors: [{ message: "Cannot query field" }] }),
    ).toThrow(/answered with an error: Cannot query field/);
    for (const bad of [null, "html", { data: { newSearch: null } }, { data: {} }]) {
      expect(() => parseRosterPage(bad)).toThrow(RosterError);
    }
  });
});

describe("runRosterSync (fixtures + in-memory MongoDB)", () => {
  let testDb: TestDb;
  let fixtures: { cleanup(): void } | null = null;

  beforeAll(async () => {
    testDb = await startTestDb();
    await getDb();
  });

  afterEach(async () => {
    fixtures?.cleanup();
    fixtures = null;
    await testDb.clear();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  async function seed(count: number) {
    await RmpTeacher.insertMany(
      Array.from({ length: count }, (_, i) => ({
        rmpId: `seed-${i}`,
        legacyId: 1 + i,
        firstName: "Seed",
        lastName: `Person${i}`,
        normalizedFirst: "seed",
        normalizedLast: `person${i}`,
        nameTokens: ["seed", `person${i}`],
        schoolId: RMP_DAVIDSON_SCHOOL_ID,
        fetchedAt: new Date("2026-09-01T00:00:00Z"),
      })),
    );
  }

  it("stores the Davidson roster, records the sync and returns a valid result", async () => {
    const result = await runRosterSync();
    expect(RosterSyncResultSchema.parse(result)).toEqual({
      ok: true,
      count: 31,
      rejectedOtherSchool: 2,
    });
    expect(await RmpTeacher.countDocuments()).toBe(31);
    const chartier = await RmpTeacher.findOne({ legacyId: 9000025 }).lean();
    expect(chartier).toMatchObject({
      firstName: "Timothy",
      lastName: "Chartier",
      department: "Mathematics",
      numRatings: 35,
      fetchedAt: now(),
    });
    const sync = await SourceSync.findOne({ sourceId: "ratemyprofessors" }).lean();
    expect(sync).toMatchObject({ ok: true, lastCount: 31, lastSuccessAt: now() });
  });

  it("replaces the roster: re-syncs are idempotent and rows that left RMP are dropped", async () => {
    await seed(3);
    await runRosterSync();
    await runRosterSync();
    expect(await RmpTeacher.countDocuments()).toBe(31);
    expect(await RmpTeacher.countDocuments({ firstName: "Seed" })).toBe(0);
  });

  it("follows the after cursor across pages and de-duplicates by legacyId", async () => {
    const shared = teacherNode("Shared", "Twice");
    fixtures = useRosterFixtures([
      {
        file: "page-2.json",
        bodyIncludes: '"after":"cursor-1"',
        body: rosterPage([teacherNode("Page", "Two"), shared]),
      },
      {
        file: "page-1.json",
        body: rosterPage([teacherNode("Page", "One"), shared], {
          hasNextPage: true,
          endCursor: "cursor-1",
        }),
      },
    ]);
    expect(await runRosterSync()).toEqual({ ok: true, count: 3, rejectedOtherSchool: 0 });
    expect((await RmpTeacher.find().lean()).map((t) => t.firstName).sort()).toEqual([
      "Page",
      "Page",
      "Shared",
    ]);
  });

  it("stops a pagination loop and a runaway roster without touching the stored roster", async () => {
    await seed(2);
    fixtures = useRosterFixtures([
      {
        file: "loop.json",
        body: rosterPage([teacherNode("Loop", "Er")], { hasNextPage: true, endCursor: "same" }),
      },
    ]);
    expect(await runRosterSync()).toMatchObject({
      ok: false,
      count: 0,
      error: expect.stringMatching(/did not advance/),
    });
    fixtures.cleanup();

    const routes = Array.from({ length: ROSTER_MAX_PAGES }, (_, i) => ({
      file: `page-${i}.json`,
      bodyIncludes: i === 0 ? undefined : `"after":"c${i}"`,
      body: rosterPage([teacherNode("Many", `Pages${i}`)], {
        hasNextPage: true,
        endCursor: `c${i + 1}`,
      }),
    })).reverse();
    fixtures = useRosterFixtures(routes);
    expect(await runRosterSync()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/more than 10 pages/),
    });
    expect(await RmpTeacher.countDocuments({ firstName: "Seed" })).toBe(2);
  });

  it("keeps the stored roster when RMP is down and records the failure", async () => {
    await seed(40);
    fixtures = useRosterFixtures([{ file: "down.json", body: "{}", status: 503 }]);
    const result = await runRosterSync();
    expect(result).toEqual({
      ok: false,
      count: 0,
      rejectedOtherSchool: 0,
      error: "RateMyProfessors answered HTTP 503.",
    });
    expect(await RmpTeacher.countDocuments()).toBe(40);
    const sync = await SourceSync.findOne({ sourceId: "ratemyprofessors" }).lean();
    expect(sync).toMatchObject({ ok: false, consecutiveFailures: 1, lastSuccessAt: null });
    expect(sync?.lastError).toContain("503");
  });

  it("keeps the stored roster when the answer is not JSON or not the expected shape", async () => {
    await seed(5);
    fixtures = useRosterFixtures([{ file: "waf.json", body: "<html>challenge</html>" }]);
    expect(await runRosterSync()).toMatchObject({
      ok: false,
      error: expect.stringContaining("parse"),
    });
    fixtures.cleanup();
    fixtures = useRosterFixtures([
      { file: "gql.json", body: { data: null, errors: [{ message: "Bad schoolID" }] } },
    ]);
    expect(await runRosterSync()).toMatchObject({
      ok: false,
      error: expect.stringContaining("Bad schoolID"),
    });
    expect(await RmpTeacher.countDocuments()).toBe(5);
  });

  it("refuses an empty roster, one below half the stored size, and a mostly malformed one", async () => {
    fixtures = useRosterFixtures([{ file: "empty.json", body: rosterPage([]) }]);
    expect(await runRosterSync()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/returned 0/),
    });
    fixtures.cleanup();

    await seed(100);
    fixtures = null;
    // The real fixture has 31 Davidson rows: fewer than half of 100.
    expect(await runRosterSync()).toMatchObject({
      ok: false,
      rejectedOtherSchool: 2,
      error: "RateMyProfessors returned 31 Davidson teachers (100 stored); kept the stored roster.",
    });
    expect(await RmpTeacher.countDocuments()).toBe(100);

    await testDb.clear();
    fixtures = useRosterFixtures([
      {
        file: "broken.json",
        body: rosterPage([
          teacherNode("Fine", "One"),
          ...Array.from({ length: 6 }, (_, i) =>
            teacherNode("Broken", `N${i}`, { numRatings: -1 }),
          ),
        ]),
      },
    ]);
    expect(await runRosterSync()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/6 of 7/),
    });
    expect(await RmpTeacher.countDocuments()).toBe(0);
  });

  it("never swallows a missing fixture", async () => {
    fixtures = useRosterFixtures([
      { file: "other.json", body: rosterPage([]), bodyIncludes: "no-such-school" },
    ]);
    await expect(runRosterSync()).rejects.toBeInstanceOf(MissingFixtureError);
  });
});
