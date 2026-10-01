import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import {
  accountDataNames,
  eraseAccountData,
  exportAccountData,
  loadAccountDataRegistrations,
  registerAccountData,
  resetAccountDataRegistry,
} from "@/server/account/erasers";
import { getDb } from "@/server/db";

// A registry unit test: keep the service modules' own registrations (W3: verificationcodes, ratelimits; tested in
// tests/w3/account-data.test.ts; W5s: plans, tested in tests/plan/service.test.ts; W6: ai, tested in
// tests/ai/account-data.test.ts) out of the exact-name assertions below.
vi.mock("@/server/auth", () => ({}));
vi.mock("@/server/plan", () => ({}));
vi.mock("@/server/ai", () => ({}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  resetAccountDataRegistry();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

describe("account data registry (PLAN §4.1.12)", () => {
  it("exports and erases every registered collection by name", async () => {
    const erased: string[] = [];
    registerAccountData("plans", {
      export: async (userId) => ({ userId, items: 3 }),
      erase: async (userId) => {
        erased.push(`plans:${userId}`);
        return 1;
      },
    });
    registerAccountData("aiusages", {
      export: async () => [],
      erase: async (userId) => {
        erased.push(`aiusages:${userId}`);
        return 4;
      },
    });
    expect(accountDataNames()).toEqual(["aiusages", "plans"]);
    expect(await exportAccountData("u1")).toEqual({
      "aicaches-legacy": [],
      aiusages: [],
      "careergoals-legacy": [],
      "courseplans-legacy": [],
      plans: { userId: "u1", items: 3 },
    });
    expect(await eraseAccountData("u1")).toEqual({
      "aicaches-legacy": 0,
      aiusages: 4,
      "careergoals-legacy": 0,
      "courseplans-legacy": 0,
      plans: 1,
    });
    expect(erased.sort()).toEqual(["aiusages:u1", "plans:u1"]);
  });

  it("runs every eraser even when one fails, then reports the failure", async () => {
    let ranSecond = false;
    registerAccountData("a-broken", {
      export: async () => null,
      erase: async () => {
        throw new Error("db down");
      },
    });
    registerAccountData("b-fine", {
      export: async () => null,
      erase: async () => {
        ranSecond = true;
        return 2;
      },
    });
    await expect(eraseAccountData("u1")).rejects.toThrow(/a-broken: db down/);
    expect(ranSecond).toBe(true);
  });

  it("replaces a registration with the same name (hot reload) and validates names", () => {
    const handler = { export: async () => 1, erase: async () => 1 };
    registerAccountData("plans", handler);
    registerAccountData("plans", { ...handler });
    expect(accountDataNames()).toEqual(["plans"]);
    expect(() => registerAccountData("Bad Name", handler)).toThrow(TypeError);
  });

  it("exports and erases the student's legacy courseplans documents (the one permitted write there)", async () => {
    await loadAccountDataRegistrations();
    expect(accountDataNames()).toContain("courseplans-legacy");
    const plans = mongoose.connection.db!.collection("courseplans");
    const mine = new mongoose.Types.ObjectId();
    const theirs = new mongoose.Types.ObjectId();
    await plans.insertMany([
      { userId: mine, plannedCourses: [{ courseCode: "CSC 121", semester: "Fall", year: 2025 }] },
      { userId: mine.toString(), plannedCourses: [] },
      { userId: theirs, plannedCourses: [] },
    ]);

    const exported = (await exportAccountData(mine.toString()))["courseplans-legacy"];
    expect(exported).toHaveLength(2);
    expect(await eraseAccountData(mine.toString())).toMatchObject({ "courseplans-legacy": 2 });
    expect(await plans.countDocuments()).toBe(1);
    expect(await plans.countDocuments({ userId: theirs })).toBe(1);
    // A malformed id matches nothing (and never throws a CastError).
    expect(await eraseAccountData("not-an-id")).toMatchObject({ "courseplans-legacy": 0 });
  });

  it("exports and erases the student's legacy career goals", async () => {
    await loadAccountDataRegistrations();
    const goals = mongoose.connection.db!.collection("careergoals");
    const mine = new mongoose.Types.ObjectId();
    const theirs = new mongoose.Types.ObjectId();
    await goals.insertMany([
      { userId: mine, targetRole: "Analyst", careerField: "Consulting", milestones: [] },
      { userId: theirs, targetRole: "Engineer", careerField: "Software Engineering" },
    ]);
    const exported = (await exportAccountData(mine.toString()))["careergoals-legacy"];
    expect(exported).toEqual([expect.objectContaining({ targetRole: "Analyst" })]);
    expect(await eraseAccountData(mine.toString())).toMatchObject({ "careergoals-legacy": 1 });
    expect(await goals.countDocuments()).toBe(1);
    expect(await goals.countDocuments({ userId: theirs })).toBe(1);
  });

  it("exports and erases the student's own legacy AI answers, keyed by id or e-mail, and nothing else", async () => {
    await loadAccountDataRegistrations();
    const caches = mongoose.connection.db!.collection("aicaches");
    const users = mongoose.connection.db!.collection("users");
    const mine = new mongoose.Types.ObjectId();
    await users.insertOne({ _id: mine, name: "Sam Lee", email: "Sam.Lee@davidson.edu" });
    // As the legacy routes wrote them: JSON.stringify({ userId: session id || session e-mail, … }).
    const key = (userId: string, rest: Record<string, unknown> = {}) =>
      JSON.stringify({ userId, major: "Economics", ...rest });
    await caches.insertMany([
      { type: "roadmap", cacheKey: key(mine.toString()), data: { a: 1 } },
      { type: "career-plan", cacheKey: key("Sam.Lee@davidson.edu"), data: { b: 1 } },
      { type: "recommendations", cacheKey: key("sam.lee@davidson.edu"), data: { c: 1 } },
      // Someone else's, including an address that merely starts with this one's.
      { type: "roadmap", cacheKey: key(new mongoose.Types.ObjectId().toString()), data: {} },
      { type: "roadmap", cacheKey: key("sam.lee@davidson.education"), data: {} },
      // Not attributable (keyed by the student's name) or shared by everyone: never touched.
      {
        type: "cold-email",
        cacheKey: JSON.stringify({ alumniName: "x", studentName: "sam lee" }),
        data: {},
      },
      { type: "course-insights", cacheKey: JSON.stringify({ courseCode: "ECO 101" }), data: {} },
      // The same key under a shared type is not the student's.
      { type: "professor-summary", cacheKey: key(mine.toString()), data: {} },
    ]);
    const exported = (await exportAccountData(mine.toString()))["aicaches-legacy"] as {
      type: string;
    }[];
    expect(exported.map((row) => row.type).sort()).toEqual([
      "career-plan",
      "recommendations",
      "roadmap",
    ]);
    expect(await eraseAccountData(mine.toString())).toMatchObject({ "aicaches-legacy": 3 });
    expect(await caches.countDocuments()).toBe(5);
    expect(await caches.countDocuments({ type: "cold-email" })).toBe(1);
    // An id with regex characters or no account matches nothing and never throws.
    expect(await eraseAccountData("u.*")).toMatchObject({ "aicaches-legacy": 0 });
    expect(await caches.countDocuments()).toBe(5);
  });
});
