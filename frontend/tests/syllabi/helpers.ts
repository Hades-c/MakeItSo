import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import User from "@/models/User";
import { getDb } from "@/server/db";

export const FIXTURES_NOW = "2026-09-30T12:00:00-04:00";

/** One in-memory MongoDB per file; users, plans and syllabi emptied after each test. */
export function withSyllabiDb(): void {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
    await getDb();
  });
  afterEach(async () => {
    const db = mongoose.connection.db;
    if (!db) return;
    await Promise.all(
      ["users", "plans", "syllabi"].map((name) => db.collection(name).deleteMany({})),
    );
  });
  afterAll(async () => {
    await testDb.stop();
  });
}

/** A bare student account (no profile fields): server/syllabi only needs a valid userId. */
export async function insertStudent(email?: string): Promise<string> {
  const { insertedId } = await User.collection.insertOne({
    name: "Sam Student",
    email: email ?? `sam-${new mongoose.Types.ObjectId().toHexString()}@davidson.edu`,
    password: "x",
    sessionVersion: 0,
    emailVerifiedAt: null,
    graduationYear: 2028,
    createdAt: new Date(FIXTURES_NOW),
    updatedAt: new Date(FIXTURES_NOW),
  });
  return insertedId.toHexString();
}
