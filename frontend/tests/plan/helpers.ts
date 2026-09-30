import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import Plan from "@/models/Plan";
import User from "@/models/User";
import { getCourseHistory } from "@/server/catalog";
import { drainBackground } from "@/server/catalog/background";
import { resetCatalogState } from "@/server/catalog/state";
import { getDb } from "@/server/db";
import { resetLegacyCache } from "@/server/plan/legacy";

/**
 * W5s test lifecycle: one in-memory MongoDB per file with the fixture catalog ingested ONCE (every fixture term,
 * 202201–202603, through the catalog's own cold load and history backfill), and the per-user collections (users,
 * plans, courseplans, ratelimits) emptied after each test. The catalog is left in place between tests: nothing
 * here writes it.
 */
export function withPlanDb(options: { catalog?: boolean } = {}): void {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
    await getDb();
    if (options.catalog !== false) {
      await getCourseHistory("CSC 121");
      await drainBackground();
    }
  });
  afterEach(async () => {
    await drainBackground();
    resetLegacyCache();
    vi.unstubAllEnvs();
    const db = mongoose.connection.db;
    if (!db) return;
    await Promise.all(
      ["users", "plans", "courseplans", "ratelimits"].map((name) =>
        db.collection(name).deleteMany({}),
      ),
    );
  });
  afterAll(async () => {
    await drainBackground();
    resetCatalogState();
    await testDb.stop();
  });
}

export const FIXTURES_NOW = "2026-09-30T12:00:00-04:00";

/** Move the server clock (server/clock.ts now()). */
export function setNow(iso: string): void {
  vi.stubEnv("FIXTURES_NOW", iso);
}

export interface StudentInput {
  graduationYear?: number;
  firstTerm?: string;
  standingOverride?: string;
  email?: string;
}

/** Insert a student straight into `users` (class of 2028, started Fall 2024, unless told otherwise). */
export async function insertStudent(input: StudentInput = {}): Promise<string> {
  const { insertedId } = await User.collection.insertOne({
    name: "Sam Student",
    email: input.email ?? `sam-${new mongoose.Types.ObjectId().toHexString()}@davidson.edu`,
    password: "x",
    sessionVersion: 0,
    emailVerifiedAt: null,
    graduationYear: input.graduationYear ?? 2028,
    ...(input.firstTerm ? { firstTerm: input.firstTerm } : {}),
    ...(input.standingOverride ? { standingOverride: input.standingOverride } : {}),
    createdAt: new Date(FIXTURES_NOW),
    updatedAt: new Date(FIXTURES_NOW),
  });
  return insertedId.toHexString();
}

/** A v1 (hackathon) plan document, written through the raw driver as the old app left it. */
export async function insertLegacyPlan(
  userId: string,
  doc: { plannedCourses?: unknown[]; summerActivities?: unknown[]; updatedAt?: Date },
): Promise<mongoose.Types.ObjectId> {
  const { insertedId } = await CoursePlanV1.collection.insertOne({
    userId: new mongoose.Types.ObjectId(userId),
    plannedCourses: doc.plannedCourses ?? [],
    summerActivities: doc.summerActivities ?? [],
    totalCreditsCompleted: 0,
    totalCreditsPlanned: 0,
    createdAt: new Date("2026-02-21T12:00:00Z"),
    updatedAt: doc.updatedAt ?? new Date("2026-03-01T12:00:00Z"),
  });
  return insertedId;
}

/** The raw v1 documents (to prove they were never touched). */
export async function legacyDocs(): Promise<unknown[]> {
  return CoursePlanV1.collection.find({}).toArray();
}

export async function planDoc(userId: string): Promise<Record<string, unknown> | null> {
  return (await Plan.collection.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  })) as Record<string, unknown> | null;
}
