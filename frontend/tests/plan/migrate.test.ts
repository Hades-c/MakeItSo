import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { insertLegacyPlan, insertStudent, legacyDocs, planDoc, withPlanDb } from "./helpers";
import Plan from "@/models/Plan";
import { parseArgs, USAGE } from "@/scripts/migrate-plans";
import { getPlan } from "@/server/plan";
import { migratePlans, type MigrationReport } from "@/server/plan/migrate";

/**
 * scripts/migrate-plans.ts (PLAN §8: optional, the owner runs it): dry run by default with a JSON report per
 * category; --apply writes v2 only where none exists; v1 is never touched. Never run against production here: the
 * CLI test uses this file's in-memory MongoDB and the fixture catalog.
 */

withPlanDb();

const run = promisify(execFile);

/** A minimal environment for the CLI child (no inherited MONGODB_URI, NODE_ENV "test"). */
function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...extra };
}
const FRONTEND = fileURLToPath(new URL("../../", import.meta.url));

const entry = (fields: Record<string, unknown>) => ({
  _id: new mongoose.Types.ObjectId(),
  courseId: new mongoose.Types.ObjectId(),
  credits: 4,
  status: "planned",
  ...fields,
});

async function seed() {
  const alice = await insertStudent();
  await insertLegacyPlan(alice, {
    plannedCourses: [
      entry({
        courseCode: "csc 121",
        courseName: "Intro CS",
        semester: "Fall",
        year: 2025,
        status: "completed",
        grade: "A",
      }),
      entry({ courseCode: "FAKE 999", courseName: "AI Ethics", semester: "Spring", year: 2027 }),
      entry({ courseCode: "ELEC ---", semester: "Spring", year: 2027 }),
      entry({
        courseCode: "ECO 101",
        semester: "Fall",
        year: 2025,
        status: "completed",
        grade: "F",
      }),
      entry({ courseCode: "CSC 221", semester: "Summer", year: 2026 }),
    ],
    summerActivities: [{ title: "Internship", summer: "Summer 2027", year: 2027 }],
  });
  const bob = await insertStudent();
  await insertLegacyPlan(bob, {
    plannedCourses: [entry({ courseCode: "CSC 221", semester: "Spring", year: 2027 })],
  });
  // Carol already has a v2 plan: left alone.
  const carol = await insertStudent();
  await insertLegacyPlan(carol, {
    plannedCourses: [entry({ courseCode: "MAT 150", semester: "Spring", year: 2027 })],
  });
  await Plan.create({ userId: new mongoose.Types.ObjectId(carol), items: [] });
  // A v1 document without an owner.
  await mongoose.connection.db!.collection("courseplans").insertOne({ plannedCourses: [] });
  return { alice, bob, carol };
}

function expectReport(report: MigrationReport, dryRun: boolean) {
  expect(report).toMatchObject({
    dryRun,
    legacyDocuments: 4,
    students: {
      seen: 3,
      withoutUserId: 1,
      alreadyV2: 1,
      converted: 2,
      written: dryRun ? 0 : 2,
      failed: 0,
    },
    failures: [],
  });
  expect(report.entries).toMatchObject({
    entries: 6,
    items: 4,
    verified: 3,
    unverified: 1,
    creditsNormalized: 4,
    failedFromGrade: 1,
    summerCourses: 1,
    summerActivities: 1,
  });
  expect(report.entries.skipped).toMatchObject({ badCode: 1, noTerm: 0 });
}

describe("parseArgs", () => {
  it("defaults to a dry run and validates its flags", () => {
    expect(parseArgs([])).toEqual({ apply: false, userIds: [] });
    expect(parseArgs(["--apply", "--limit=5", "--user=650000000000000000000001"])).toEqual({
      apply: true,
      limit: 5,
      userIds: ["650000000000000000000001"],
    });
    expect(parseArgs(["--apply", "--dry-run"])).toMatchObject({ apply: false });
    expect(parseArgs(["--user=nope"])).toEqual({ error: `Not a user id: nope\n${USAGE}` });
    expect(parseArgs(["--limit=0"])).toMatchObject({
      error: expect.stringContaining("Not a limit"),
    });
    expect(parseArgs(["--force"])).toMatchObject({
      error: expect.stringContaining("Unknown argument: --force"),
    });
  });
});

describe("migratePlans", () => {
  it("dry run: reports per category and writes nothing", async () => {
    const { alice } = await seed();
    const before = await legacyDocs();
    expectReport(await migratePlans({ apply: false }), true);
    expect(await planDoc(alice)).toBeNull();
    expect(await legacyDocs()).toEqual(before);
  });

  it("--apply: writes v2 exactly as the app's conversion, never over an existing v2, never touching v1", async () => {
    const { alice, bob, carol } = await seed();
    const before = await legacyDocs();
    const lazy = await getPlan(alice);
    expectReport(await migratePlans({ apply: true }), false);
    const written = await getPlan(alice);
    expect(written.legacy).toBe(false);
    expect(written.items).toEqual(lazy.items);
    expect(written.summer).toEqual(lazy.summer);
    expect((await planDoc(alice))?.importedFromLegacy).toMatchObject({ via: "migration" });
    expect((await getPlan(bob)).items.map((i) => i.courseCode)).toEqual(["CSC 221"]);
    expect((await getPlan(carol)).items).toEqual([]);
    expect(await legacyDocs()).toEqual(before);
    // Idempotent: a second run finds everyone migrated.
    const again = await migratePlans({ apply: true });
    expect(again.students).toMatchObject({ alreadyV2: 3, converted: 0, written: 0 });
  });

  it("limits the run to given students and a count", async () => {
    const { bob } = await seed();
    const one = await migratePlans({ apply: false, userIds: [bob] });
    expect(one.students).toMatchObject({ seen: 1, converted: 1 });
    expect((await migratePlans({ apply: false, limit: 2 })).students.seen).toBe(2);
  });

  it("reports a student whose conversion fails, and carries on", async () => {
    const { alice } = await seed();
    const report = await migratePlans({
      apply: true,
      lookup: async (_term, code) => {
        if (code === "CSC 221") throw new Error("Schedule data is temporarily unavailable.");
        return null;
      },
    });
    expect(report.students).toMatchObject({ converted: 1, written: 1, failed: 1 });
    expect(report.failures).toEqual([
      { userId: expect.any(String), error: "Schedule data is temporarily unavailable." },
    ]);
    expect(await planDoc(alice)).not.toBeNull();
  });
});

describe("the CLI (plain Node, fixtures catalog, this test's in-memory database)", () => {
  it("prints the dry-run JSON report; --apply writes v2", async () => {
    const { alice } = await seed();
    const env = childEnv({
      HOME: process.env.HOME ?? "",
      MONGODB_URI: process.env.MONGODB_URI ?? "",
      EXTERNAL_MODE: "fixtures",
      FIXTURES_NOW: "2026-09-30T12:00:00-04:00",
    });
    const dry = await run(process.execPath, ["scripts/migrate-plans.ts"], {
      cwd: FRONTEND,
      env,
      timeout: 120_000,
    });
    expectReport(JSON.parse(dry.stdout) as MigrationReport, true);
    expect(await planDoc(alice)).toBeNull();
    const applied = await run(
      process.execPath,
      ["scripts/migrate-plans.ts", "--apply", `--user=${alice}`],
      {
        cwd: FRONTEND,
        env,
        timeout: 120_000,
      },
    );
    expect((JSON.parse(applied.stdout) as MigrationReport).students).toMatchObject({
      seen: 1,
      written: 1,
    });
    expect((await getPlan(alice)).items.map((i) => i.courseCode)).toEqual([
      "CSC 121",
      "FAKE 999",
      "ECO 101",
    ]);
  }, 180_000);

  it("refuses to run without MONGODB_URI or with bad flags", async () => {
    const env = childEnv({});
    const missing = await run(process.execPath, ["scripts/migrate-plans.ts"], {
      cwd: FRONTEND,
      env,
    }).catch((e: unknown) => e);
    expect(missing).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("MONGODB_URI is not set."),
    });
    const bad = await run(process.execPath, ["scripts/migrate-plans.ts", "--nope"], {
      cwd: FRONTEND,
      env,
    }).catch((e: unknown) => e);
    expect(bad).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("Unknown argument: --nope"),
    });
  });
});
