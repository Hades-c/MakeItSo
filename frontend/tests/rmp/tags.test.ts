import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import {
  RMP_DAVIDSON_SCHOOL_ID,
  RMP_TAGS,
  type RmpTag,
  TagSyncResultSchema,
} from "@/lib/types/ratings";
import RmpTagSync from "@/models/RmpTagSync";
import RmpTeacher from "@/models/RmpTeacher";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import type * as ExternalModule from "@/server/http/external";
import { fetchExternal } from "@/server/http/external";
import { MissingFixtureError } from "@/server/http/fixtures";
import { syncRoster } from "@/server/rmp";
import { indexTokens, normalizeName } from "@/server/rmp/normalize";
import {
  normalizeTag,
  parseRatingTags,
  parseTagsResponse,
  runTagSync,
  TAG_BATCH_SIZE,
  TAG_MAX_EMPTY_BATCHES,
  TAG_PAGE_SIZE,
  TAG_RETRY_MAX_DAYS,
  tagRetryAt,
  TAGS_MAX_AGE_DAYS,
  TagsError,
  tagsRequestBody,
  topTags,
} from "@/server/rmp/tags";
import { serveRosterFixtures } from "./fixture-dir";
import { readFixtureJson } from "./helpers";

// Wrap fetchExternal to count requests and how many run at once.
vi.mock("@/server/http/external", async (importOriginal) => {
  const actual = await importOriginal<typeof ExternalModule>();
  return { ...actual, fetchExternal: vi.fn(actual.fetchExternal) };
});

describe("the tag vocabulary", () => {
  it("is RMP's fixed list: distinct, sentence case, no stray spaces", () => {
    expect(RMP_TAGS).toHaveLength(23);
    expect(new Set(RMP_TAGS.map((tag) => tag.toLowerCase())).size).toBe(RMP_TAGS.length);
    for (const tag of RMP_TAGS) {
      expect(tag).toBe(tag.trim());
      expect(tag).not.toMatch(/\s{2}/);
      expect(tag[0]).toBe(tag[0]!.toUpperCase());
    }
  });

  it("normalises RMP's spelling (trailing spaces, case, spacing, NFKC) and rejects anything else", () => {
    expect(normalizeTag("Amazing lectures ")).toBe("Amazing lectures");
    expect(normalizeTag("  PARTICIPATION   MATTERS")).toBe("Participation matters");
    expect(normalizeTag("Skip class? You won't pass.")).toBe("Skip class? You won't pass.");
    expect(normalizeTag("Ｃａｒｉｎｇ")).toBe("Caring");
    expect(normalizeTag("Tests? Not many")).toBe("Tests? Not many");
    for (const other of ["", "Amazing", "Amazing lectures!", "Great professor", "<b>Caring</b>"]) {
      expect(normalizeTag(other), other).toBeNull();
    }
  });
});

describe("parseRatingTags", () => {
  it("splits RMP's '--' string into known tags, once each, and counts what it drops", () => {
    expect(
      parseRatingTags("Participation matters--Amazing lectures --Gives good feedback"),
    ).toEqual({
      tags: ["Participation matters", "Amazing lectures", "Gives good feedback"],
      dropped: 0,
    });
    expect(parseRatingTags("Tough grader--TOUGH GRADER --Hilarious")).toEqual({
      tags: ["Tough grader", "Hilarious"],
      dropped: 0,
    });
    expect(parseRatingTags("Caring--Made-up tag--")).toEqual({ tags: ["Caring"], dropped: 1 });
    for (const empty of [null, undefined, "", "--", " -- "]) {
      expect(parseRatingTags(empty)).toEqual({ tags: [], dropped: 0 });
    }
  });
});

describe("topTags", () => {
  it("keeps the five most used, most used first, ties alphabetically", () => {
    const counts = new Map<RmpTag, number>([
      ["Respected", 3],
      ["Caring", 8],
      ["Hilarious", 3],
      ["Tough grader", 1],
      ["Lecture heavy", 0],
      ["Amazing lectures", 3],
      ["Test heavy", 2],
      ["Extra credit", 1],
    ]);
    expect(topTags(counts)).toEqual([
      { tag: "Caring", count: 8 },
      { tag: "Amazing lectures", count: 3 },
      { tag: "Hilarious", count: 3 },
      { tag: "Respected", count: 3 },
      { tag: "Test heavy", count: 2 },
    ]);
    expect(topTags(counts, 1)).toEqual([{ tag: "Caring", count: 8 }]);
    expect(topTags(new Map())).toEqual([]);
  });
});

describe("the tag request", () => {
  const items = [
    { legacyId: 9000001, rmpId: "VGVhY2hlci05MDAwMDAx", after: null },
    { legacyId: 9000025, rmpId: "VGVhY2hlci05MDAwMDI1", after: "Y3Vyc29yLTE=" },
  ];

  it("asks for each teacher by alias, with every value passed as a variable", () => {
    const body = tagsRequestBody(items);
    expect(body.variables).toEqual({
      first: TAG_PAGE_SIZE,
      id9000001: "VGVhY2hlci05MDAwMDAx",
      id9000025: "VGVhY2hlci05MDAwMDI1",
      after9000025: "Y3Vyc29yLTE=",
    });
    expect(body.query).toMatch(/^query DavidsonTeacherTags\(\$first: Int!, \$id9000001: ID!/);
    expect(body.query).toContain("t9000001: node(id: $id9000001)");
    expect(body.query).toContain("ratings(first: $first, after: $after9000025)");
    // No id, cursor or name is ever written into the query text.
    expect(body.query).not.toContain("VGVhY2hlci05MDAwMDAx");
    expect(body.query).not.toContain("Y3Vyc29yLTE=");
    expect(tagsRequestBody(items, 20).variables.first).toBe(20);
    expect(() => tagsRequestBody([{ legacyId: 1.5, rmpId: "x", after: null }])).toThrow(TypeError);
  });

  it("requests ratingTags and the paging fields only: no comments, classes, dates or other fields", () => {
    const { query } = tagsRequestBody(items);
    const fields = new Set(
      query
        .replace(/query \w+\([^)]*\)/, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/\bt\d+:/g, "")
        .match(/[A-Za-z_]+/g),
    );
    expect([...fields].sort()).toEqual(
      [
        "Teacher",
        "edges",
        "endCursor",
        "hasNextPage",
        "node",
        "on",
        "pageInfo",
        "ratingTags",
        "ratings",
      ].sort(),
    );
    expect(query).not.toMatch(/comment|class|date|teacherRatingTags|thumbs|flag/i);
  });
});

describe("parseTagsResponse", () => {
  const page = (
    ratingTags: (string | null)[],
    pageInfo = { hasNextPage: false, endCursor: "end" },
  ) => ({
    ratings: { edges: ratingTags.map((tags) => ({ node: { ratingTags: tags } })), pageInfo },
  });

  it("reads the requested aliases only and reduces each page to its tags", () => {
    const pages = parseTagsResponse(
      {
        data: {
          t1: page(["Caring--Respected", null, "", "Nonsense"]),
          t2: page(["Hilarious"], { hasNextPage: true, endCursor: "c2" }),
          t3: page(["Tough grader"]),
        },
      },
      [{ legacyId: 1 }, { legacyId: 2 }],
    );
    expect([...pages.keys()]).toEqual([1, 2]);
    expect(pages.get(1)).toEqual({
      ratings: 4,
      tags: [["Caring", "Respected"], [], [], []],
      dropped: 1,
      hasNextPage: false,
      endCursor: "end",
    });
    expect(pages.get(2)).toMatchObject({ ratings: 1, hasNextPage: true, endCursor: "c2" });
  });

  it("answers null for a teacher whose alias is missing, null or malformed", () => {
    const pages = parseTagsResponse(
      { data: { t1: page(["Caring"]), t2: null, t4: { ratings: { edges: "nope" } } } },
      [{ legacyId: 1 }, { legacyId: 2 }, { legacyId: 3 }, { legacyId: 4 }],
    );
    expect(pages.get(1)).not.toBeNull();
    expect([pages.get(2), pages.get(3), pages.get(4)]).toEqual([null, null, null]);
  });

  it("answers null for every teacher when none is usable, so the run can mark them and go on", () => {
    const pages = parseTagsResponse(
      { data: { t1: null, t2: null }, errors: [{ message: "not found" }] },
      [{ legacyId: 1 }, { legacyId: 2 }],
    );
    expect([...pages]).toEqual([
      [1, null],
      [2, null],
    ]);
  });

  it("throws TagsError when the answer as a whole is unusable", () => {
    expect(() =>
      parseTagsResponse({ errors: [{ message: "Too many requests" }] }, [{ legacyId: 1 }]),
    ).toThrow("RateMyProfessors answered with an error: Too many requests");
    expect(() => parseTagsResponse({ data: null }, [{ legacyId: 1 }])).toThrow(TagsError);
    expect(() => parseTagsResponse("<html>", [{ legacyId: 1 }])).toThrow(TagsError);
  });
});

describe("runTagSync (fixtures + in-memory MongoDB)", () => {
  let testDb: TestDb;
  let fixtures: { cleanup(): void } | null = null;

  beforeAll(async () => {
    testDb = await startTestDb();
    await getDb();
  });

  beforeEach(() => {
    vi.mocked(fetchExternal).mockClear();
  });

  afterEach(async () => {
    fixtures?.cleanup();
    fixtures = null;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await testDb.clear();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  /** Davidson teachers with ratings in the synthetic roster (31 Davidson rows, 4 of them unrated). */
  const RATED = 27;

  const run = (options: Partial<Parameters<typeof runTagSync>[0]> = {}) =>
    runTagSync({ budgetMs: 60_000, pauseMs: 0, ...options });

  async function storedTags(legacyId: number) {
    return RmpTeacher.findOne({ legacyId })
      .select("topTags tagRatingsCounted tagsNumRatings tagsFetchedAt -_id")
      .lean();
  }

  async function backoff(legacyId: number) {
    return RmpTeacher.findOne({ legacyId }).select("tagsFailures tagsRetryAt -_id").lean();
  }

  /** Rated teachers written straight to the collection, for the hand-made fixture answers. */
  async function seedTeachers(legacyIds: number[], numRatings = 5) {
    await RmpTeacher.insertMany(
      legacyIds.map((legacyId) => ({
        rmpId: Buffer.from(`Teacher-${legacyId}`).toString("base64"),
        legacyId,
        firstName: "Test",
        lastName: `Person${legacyId}`,
        normalizedFirst: normalizeName("Test"),
        normalizedLast: normalizeName(`Person${legacyId}`),
        nameTokens: indexTokens("Test", `Person${legacyId}`),
        schoolId: RMP_DAVIDSON_SCHOOL_ID,
        numRatings,
        avgRating: 4,
        avgDifficulty: 3,
        fetchedAt: new Date("2026-09-01T00:00:00Z"),
      })),
    );
  }

  const ratingsPage = (tags: string[], hasNextPage = false, endCursor: string | null = "end") => ({
    ratings: {
      edges: tags.map((ratingTags) => ({ node: { ratingTags } })),
      pageInfo: { hasNextPage, endCursor },
    },
  });

  it("counts every rated teacher in a few batched requests and stores the top five", async () => {
    expect((await syncRoster()).ok).toBe(true);
    const result = await run();
    expect(TagSyncResultSchema.parse(result)).toEqual({
      ok: true,
      updated: RATED,
      skipped: 0,
      remaining: 0,
      requests: Math.ceil(RATED / TAG_BATCH_SIZE),
      outOfTime: false,
    });
    // Counted independently from tags-davidson.json: a rating counts each tag once (the duplicate and the upper
    // case "TOUGH GRADER " of rating 1), the unknown tag is dropped, null and "--" ratings count as untagged.
    expect(await storedTags(9000001)).toEqual({
      topTags: [
        { tag: "Tough grader", count: 13 },
        { tag: "Get ready to read", count: 11 },
        { tag: "So many papers", count: 7 },
        { tag: "Graded by few things", count: 5 },
        { tag: "Accessible outside class", count: 2 },
      ],
      tagRatingsCounted: 41,
      tagsNumRatings: 41,
      tagsFetchedAt: now(),
    });
    expect(await storedTags(9000004)).toMatchObject({
      topTags: [
        { tag: "Extra credit", count: 4 },
        { tag: "Get ready to read", count: 3 },
        { tag: "Beware of pop quizzes", count: 2 },
        { tag: "Amazing lectures", count: 1 },
        { tag: "Clear grading criteria", count: 1 },
      ],
      tagRatingsCounted: 8,
    });
    // Unrated teachers are never asked for.
    expect(await storedTags(9000005)).toMatchObject({ topTags: [], tagsFetchedAt: null });
    expect(await RmpTagSync.findOne({ key: "tags" }).lean()).toMatchObject({
      ok: true,
      lastSuccessAt: now(),
      lastUpdated: RATED,
      lastRequests: 3,
      remaining: 0,
      consecutiveFailures: 0,
    });
  });

  it("sends at most TAG_CONCURRENCY requests at once, each with at most TAG_BATCH_SIZE teachers", async () => {
    expect((await syncRoster()).ok).toBe(true);
    const actual = vi.mocked(fetchExternal).getMockImplementation()!;
    onTestFinished(() => {
      vi.mocked(fetchExternal).mockImplementation(actual);
    });
    let inFlight = 0;
    let peak = 0;
    const sizes: number[] = [];
    vi.mocked(fetchExternal).mockImplementation(async (...args) => {
      const body = args[2]?.body as { variables: Record<string, unknown> };
      sizes.push(Object.keys(body.variables).filter((key) => key.startsWith("id")).length);
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await actual(...args);
      } finally {
        inFlight--;
      }
    });
    expect(await run({ batchSize: 4, concurrency: 2 })).toMatchObject({
      ok: true,
      updated: RATED,
      requests: 7,
    });
    expect(peak).toBe(2);
    expect(Math.max(...sizes)).toBe(4);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(RATED);
  });

  it("recounts only teachers with a changed numRatings or a count older than the maximum age", async () => {
    expect((await syncRoster()).ok).toBe(true);
    await run();
    vi.mocked(fetchExternal).mockClear();

    expect(await run()).toEqual({
      ok: true,
      updated: 0,
      skipped: 0,
      remaining: 0,
      requests: 0,
      outOfTime: false,
    });
    expect(fetchExternal).not.toHaveBeenCalled();

    // A new rating on RMP (the roster sync stores the new numRatings; it never touches the tag fields).
    await RmpTeacher.updateOne({ legacyId: 9000004 }, { $set: { numRatings: 9 } });
    expect(await run()).toMatchObject({ updated: 1, skipped: 0, remaining: 0, requests: 1 });
    expect(await storedTags(9000004)).toMatchObject({ tagsNumRatings: 9, tagRatingsCounted: 8 });

    vi.stubEnv(
      "FIXTURES_NOW",
      new Date(now().getTime() + (TAGS_MAX_AGE_DAYS + 1) * 864e5).toISOString(),
    );
    expect(await run()).toMatchObject({ updated: RATED, skipped: 0, remaining: 0 });
  });

  it("keeps the tag fields when the roster is synced again", async () => {
    expect((await syncRoster()).ok).toBe(true);
    await run();
    expect((await syncRoster()).ok).toBe(true);
    expect((await storedTags(9000001))?.topTags).toHaveLength(5);
  });

  it("stops at its time budget and the next run continues with the teachers not counted yet", async () => {
    expect((await syncRoster()).ok).toBe(true);
    // A fake clock: every look at it takes 10 s. Each request needs its 15 s timeout + 5 s reserve.
    let ms = 0;
    const clock = () => (ms += 10_000);
    const first = await run({ budgetMs: 30_000, clock, concurrency: 1 });
    expect(first).toMatchObject({ ok: true, outOfTime: true });
    expect(first.updated).toBe(first.requests * TAG_BATCH_SIZE);
    expect(first.requests).toBeGreaterThan(0);
    expect(first.remaining).toBe(RATED - first.updated);
    const counted = await RmpTeacher.find({ tagsFetchedAt: trusted({ $ne: null }) }).distinct(
      "legacyId",
    );
    expect(counted).toHaveLength(first.updated);
    // Never counted first, then legacyId: the first batch is the lowest ids.
    expect(Math.max(...counted)).toBeLessThan(9000020);
    expect(await RmpTagSync.findOne({ key: "tags" }).lean()).toMatchObject({
      ok: true,
      outOfTime: true,
      remaining: first.remaining,
    });

    vi.mocked(fetchExternal).mockClear();
    const second = await run();
    expect(second).toMatchObject({
      ok: true,
      updated: first.remaining,
      remaining: 0,
      outOfTime: false,
    });
    const asked = vi
      .mocked(fetchExternal)
      .mock.calls.flatMap(([, , options]) =>
        Object.keys((options?.body as { variables: Record<string, unknown> }).variables),
      )
      .filter((key) => key.startsWith("id"))
      .map((key) => Number(key.slice(2)));
    expect(asked.filter((id) => counted.includes(id))).toEqual([]);
  });

  it("does not start a request without the time to finish it", async () => {
    expect((await syncRoster()).ok).toBe(true);
    vi.mocked(fetchExternal).mockClear();
    expect(await run({ budgetMs: 19_000 })).toEqual({
      ok: true,
      updated: 0,
      skipped: 0,
      remaining: RATED,
      requests: 0,
      outOfTime: true,
    });
    expect(fetchExternal).not.toHaveBeenCalled();
  });

  it("pages each teacher with its own cursor and stores the sum of its pages", async () => {
    await seedTeachers([101, 102]);
    fixtures = serveRosterFixtures([
      {
        file: "page-2.json",
        bodyIncludes: '"after101":"cursor-101-2"',
        body: { data: { t101: ratingsPage(["Caring", "Hilarious--Caring"]) } },
      },
      {
        file: "page-1.json",
        bodyIncludes: "DavidsonTeacherTags",
        body: {
          data: {
            t101: ratingsPage(["Caring--Respected", ""], true, "cursor-101-2"),
            t102: ratingsPage(["Test heavy"]),
          },
        },
      },
    ]);
    expect(await run()).toMatchObject({ ok: true, updated: 2, requests: 2, remaining: 0 });
    expect(await storedTags(101)).toMatchObject({
      topTags: [
        { tag: "Caring", count: 3 },
        { tag: "Hilarious", count: 1 },
        { tag: "Respected", count: 1 },
      ],
      tagRatingsCounted: 4,
    });
    expect(await storedTags(102)).toMatchObject({
      topTags: [{ tag: "Test heavy", count: 1 }],
      tagRatingsCounted: 1,
    });
  });

  it("skips and backs off a teacher whose cursor does not advance or whose answer is missing; stores the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await seedTeachers([201, 202, 203]);
    fixtures = serveRosterFixtures([
      {
        file: "page-again.json",
        bodyIncludes: '"after201":"same"',
        body: { data: { t201: ratingsPage(["Caring"], true, "same") } },
      },
      {
        file: "page-1.json",
        bodyIncludes: "DavidsonTeacherTags",
        body: {
          data: { t201: ratingsPage(["Caring"], true, "same"), t202: ratingsPage(["Hilarious"]) },
        },
      },
    ]);
    // 201 and 203 wait out a day's backoff: not counted, and not due (so not in `remaining`) until then.
    expect(await run()).toMatchObject({ ok: true, updated: 1, skipped: 2, remaining: 0 });
    expect((await storedTags(201))?.tagsFetchedAt).toBeNull();
    expect((await storedTags(202))?.topTags).toEqual([{ tag: "Hilarious", count: 1 }]);
    expect((await storedTags(203))?.tagsFetchedAt).toBeNull();
    expect(await backoff(201)).toEqual({ tagsFailures: 1, tagsRetryAt: tagRetryAt(now(), 1) });
    expect(await backoff(203)).toEqual({ tagsFailures: 1, tagsRetryAt: tagRetryAt(now(), 1) });
    expect(await backoff(202)).toEqual({ tagsFailures: 0, tagsRetryAt: null });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipped 2 teacher(s)"));
    expect(await RmpTagSync.findOne({ key: "tags" }).lean()).toMatchObject({
      ok: true,
      lastUpdated: 1,
      lastSkipped: 2,
    });
  });

  it("never lets a full batch of bad teachers at the front hold back the rest of the queue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Ten teachers whose node answers null come first in the work order (never counted, lowest ids): before the
    // backoff, every run asked for them first, got nothing usable and stopped, run after run.
    const bad = Array.from({ length: TAG_BATCH_SIZE }, (_, i) => 101 + i);
    const good = Array.from({ length: TAG_BATCH_SIZE }, (_, i) => 201 + i);
    await seedTeachers([...bad, ...good]);
    const data: Record<string, unknown> = {};
    for (const id of bad) data[`t${id}`] = null;
    for (const id of good) data[`t${id}`] = ratingsPage(["Caring", "Caring--Hilarious"]);
    fixtures = serveRosterFixtures([
      {
        file: "tags.json",
        bodyIncludes: "DavidsonTeacherTags",
        body: { data, errors: [{ message: "not found" }] },
      },
    ]);
    const first = await run({ concurrency: 1 });
    expect(first).toEqual({
      ok: true,
      updated: TAG_BATCH_SIZE,
      skipped: TAG_BATCH_SIZE,
      remaining: 0,
      requests: 2,
      outOfTime: false,
    });
    for (const id of good) {
      expect(await storedTags(id), String(id)).toMatchObject({
        topTags: [
          { tag: "Caring", count: 2 },
          { tag: "Hilarious", count: 1 },
        ],
        tagRatingsCounted: 2,
      });
    }
    for (const id of bad) expect((await backoff(id))?.tagsFailures, String(id)).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipped 10 teacher(s)"));

    // The next day the bad ones are due again: still bad, so they wait twice as long. Nothing else is asked.
    vi.mocked(fetchExternal).mockClear();
    vi.stubEnv("FIXTURES_NOW", new Date(now().getTime() + 864e5).toISOString());
    expect(await run()).toMatchObject({
      ok: true,
      updated: 0,
      skipped: TAG_BATCH_SIZE,
      requests: 1,
    });
    expect(await backoff(101)).toEqual({ tagsFailures: 2, tagsRetryAt: tagRetryAt(now(), 2) });
    expect(tagRetryAt(now(), 2).getTime() - now().getTime()).toBe(2 * 864e5);
    // A day later they wait; a good answer then clears the backoff.
    vi.stubEnv("FIXTURES_NOW", new Date(now().getTime() + 864e5).toISOString());
    expect(await run()).toMatchObject({ updated: 0, skipped: 0, requests: 0, remaining: 0 });
    fixtures.cleanup();
    for (const id of bad) data[`t${id}`] = ratingsPage(["Respected"]);
    fixtures = serveRosterFixtures([
      { file: "tags.json", bodyIncludes: "DavidsonTeacherTags", body: { data } },
    ]);
    vi.stubEnv("FIXTURES_NOW", new Date(now().getTime() + 864e5).toISOString());
    expect(await run()).toMatchObject({ ok: true, updated: TAG_BATCH_SIZE, skipped: 0 });
    expect(await backoff(101)).toEqual({ tagsFailures: 0, tagsRetryAt: null });
    expect((await storedTags(101))?.topTags).toEqual([{ tag: "Respected", count: 1 }]);
  });

  it("stops after TAG_MAX_EMPTY_BATCHES requests in a row with no usable teacher, marking them all", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ids = Array.from(
      { length: TAG_BATCH_SIZE * (TAG_MAX_EMPTY_BATCHES + 1) },
      (_, i) => 601 + i,
    );
    await seedTeachers(ids);
    fixtures = serveRosterFixtures([
      {
        file: "tags.json",
        bodyIncludes: "DavidsonTeacherTags",
        body: { data: Object.fromEntries(ids.map((id) => [`t${id}`, null])) },
      },
    ]);
    const result = await run({ concurrency: 1 });
    expect(result).toEqual({
      ok: false,
      updated: 0,
      skipped: TAG_BATCH_SIZE * TAG_MAX_EMPTY_BATCHES,
      // The last batch was never asked for: still due.
      remaining: TAG_BATCH_SIZE,
      requests: TAG_MAX_EMPTY_BATCHES,
      outOfTime: false,
      error: `RateMyProfessors answered without any of the requested teachers (${TAG_MAX_EMPTY_BATCHES} requests in a row).`,
    });
    // The next run starts with the teachers not asked yet.
    vi.mocked(fetchExternal).mockClear();
    await run({ concurrency: 1 });
    const asked = vi
      .mocked(fetchExternal)
      .mock.calls.flatMap(([, , options]) =>
        Object.keys((options?.body as { variables: Record<string, unknown> }).variables),
      )
      .filter((key) => key.startsWith("id"))
      .map((key) => Number(key.slice(2)));
    expect(asked).toEqual(ids.slice(TAG_BATCH_SIZE * TAG_MAX_EMPTY_BATCHES));
  });

  it("doubles the backoff per failure in a row, up to TAG_RETRY_MAX_DAYS", () => {
    const at = new Date("2026-09-30T16:00:00Z");
    const days = (failures: number) => (tagRetryAt(at, failures).getTime() - at.getTime()) / 864e5;
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(days)).toEqual([1, 2, 4, 8, 16, 30, 30, 30]);
    expect(TAG_RETRY_MAX_DAYS).toBe(30);
  });

  it("stores the first maxPages pages of a teacher with more", async () => {
    await seedTeachers([301]);
    fixtures = serveRosterFixtures([
      {
        file: "page-1.json",
        bodyIncludes: "DavidsonTeacherTags",
        body: { data: { t301: ratingsPage(["Caring", "Caring"], true, "more") } },
      },
    ]);
    expect(await run({ maxPages: 1 })).toMatchObject({ ok: true, updated: 1, requests: 1 });
    expect(await storedTags(301)).toMatchObject({
      topTags: [{ tag: "Caring", count: 2 }],
      tagRatingsCounted: 2,
    });
  });

  it("stops on an upstream failure, keeps the stored counts and records the failure", async () => {
    expect((await syncRoster()).ok).toBe(true);
    await run();
    await RmpTeacher.updateMany({}, { $set: { tagsNumRatings: 0 } });
    const before = await storedTags(9000001);
    fixtures = serveRosterFixtures([
      { file: "error.json", bodyIncludes: "DavidsonTeacherTags", body: "oops", status: 500 },
    ]);
    const result = await run({ concurrency: 1 });
    expect(result).toEqual({
      ok: false,
      updated: 0,
      skipped: 0,
      remaining: RATED,
      requests: 1,
      outOfTime: false,
      error: "RateMyProfessors answered HTTP 500.",
    });
    expect(await storedTags(9000001)).toEqual(before);
    expect(await RmpTagSync.findOne({ key: "tags" }).lean()).toMatchObject({
      ok: false,
      lastError: "RateMyProfessors answered HTTP 500.",
      lastErrorAt: now(),
      consecutiveFailures: 1,
      lastSuccessAt: now(),
    });
  });

  it("stops on a GraphQL error answer", async () => {
    await seedTeachers([401]);
    fixtures = serveRosterFixtures([
      {
        file: "errors.json",
        bodyIncludes: "DavidsonTeacherTags",
        body: { errors: [{ message: "Rate limited" }] },
      },
    ]);
    expect(await run()).toMatchObject({
      ok: false,
      updated: 0,
      skipped: 0,
      remaining: 1,
      error: "RateMyProfessors answered with an error: Rate limited",
    });
  });

  it("never catches a missing fixture", async () => {
    await seedTeachers([501]);
    fixtures = serveRosterFixtures([
      { file: "roster.json", body: { data: {} } }, // only the roster route: the tag request has none
    ]);
    await expect(run()).rejects.toBeInstanceOf(MissingFixtureError);
  });

  it("records a database failure and rethrows it", async () => {
    expect((await syncRoster()).ok).toBe(true);
    vi.spyOn(RmpTeacher, "bulkWrite").mockRejectedValue(new Error("disk full"));
    await expect(run()).rejects.toThrow("disk full");
    expect(await RmpTagSync.findOne({ key: "tags" }).lean()).toMatchObject({
      ok: false,
      lastError: "Could not store the RateMyProfessors tag counts.",
    });
  });

  it("does nothing before the first roster sync", async () => {
    expect(await run()).toEqual({
      ok: true,
      updated: 0,
      skipped: 0,
      remaining: 0,
      requests: 0,
      outOfTime: false,
    });
    expect(fetchExternal).not.toHaveBeenCalled();
  });
});

describe("the tag fixture", () => {
  it("is synthetic: only ratingTags per rating, only RMP tags, one alias per rated Davidson teacher", () => {
    const { data } = readFixtureJson("ratemyprofessors", "tags-davidson.json") as {
      data: Record<string, { ratings: { edges: { node: Record<string, unknown> }[] } }>;
    };
    expect(Object.keys(data)).toHaveLength(27);
    for (const [alias, node] of Object.entries(data)) {
      expect(alias).toMatch(/^t9\d{6}$/);
      expect(Object.keys(node)).toEqual(["ratings"]);
      for (const { node: rating } of node.ratings.edges) {
        expect(Object.keys(rating)).toEqual(["ratingTags"]);
      }
    }
    const unknown = Object.values(data)
      .flatMap((node) => node.ratings.edges)
      .flatMap(({ node }) => String(node.ratingTags ?? "").split("--"))
      .filter((part) => part.trim() && !normalizeTag(part));
    expect(unknown).toEqual(["Synthetic tag outside the vocabulary"]);
  });
});
