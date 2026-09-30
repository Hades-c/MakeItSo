import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import CoursePlan, { type IPlannedCourse } from "@/models/CoursePlan";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterAll(async () => {
  await testDb.stop();
});

describe("CoursePlan pre-save hook (mongoose 9)", () => {
  // Regression test for audit devex/mongoose9-breaks-presave: `pre("save", function (next) { next() })`
  // throws "next is not a function" on mongoose 9.
  it("saves and recomputes totals", async () => {
    const course = (code: string, status: IPlannedCourse["status"]): IPlannedCourse => ({
      courseId: new mongoose.Types.ObjectId(),
      courseCode: code,
      courseName: code,
      credits: 1,
      semester: "Fall",
      year: 2026,
      status,
    });
    const plan = await CoursePlan.create({
      userId: new mongoose.Types.ObjectId(),
      plannedCourses: [
        course("CSC 121", "completed"),
        course("MAT 140", "planned"),
        course("WRI 101", "dropped"),
      ],
    });
    expect(plan.totalCreditsCompleted).toBe(1);
    expect(plan.totalCreditsPlanned).toBe(2);
  });
});
