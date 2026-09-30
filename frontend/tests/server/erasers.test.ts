import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
      aiusages: [],
      "courseplans-legacy": [],
      plans: { userId: "u1", items: 3 },
    });
    expect(await eraseAccountData("u1")).toEqual({
      aiusages: 4,
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
});
