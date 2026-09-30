import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { flagLegacyAccounts, formatReport, parseArgs, USAGE } from "@/scripts/flag-legacy-accounts";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const cutoff = new Date("2026-10-14T00:00:00Z");

async function seed() {
  const users = mongoose.connection.db!.collection("users");
  await users.insertMany([
    { email: "old1@davidson.edu", createdAt: new Date("2026-02-01T00:00:00Z") },
    { email: "old2@gmail.com", createdAt: new Date("2026-03-01T00:00:00Z") },
    {
      email: "old3@davidson.edu",
      createdAt: new Date("2026-04-01T00:00:00Z"),
      emailVerifiedAt: new Date("2026-10-01T00:00:00Z"),
    },
    {
      email: "flagged@davidson.edu",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      legacyAccount: true,
    },
    // No createdAt: the ObjectId's time (2026-01-15) decides.
    {
      _id: mongoose.Types.ObjectId.createFromTime(Date.parse("2026-01-15T00:00:00Z") / 1000),
      email: "nodate@davidson.edu",
    },
    {
      email: "new@davidson.edu",
      createdAt: new Date("2026-10-20T00:00:00Z"),
      emailVerifiedAt: null,
    },
    // A new-flow sign-up from before the cutoff that is still unverified: never flagged (review regression:
    // flagging it would make a squatted sign-up permanent).
    {
      email: "pending@davidson.edu",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      emailVerifiedAt: null,
    },
  ]);
  return users;
}

describe("scripts/flag-legacy-accounts.ts", () => {
  it("parses its arguments (cutoff required, dry run by default)", () => {
    expect(parseArgs(["--cutoff=2026-10-14"])).toEqual({ cutoff, apply: false });
    expect(parseArgs(["--cutoff=2026-10-14T08:00:00-04:00", "--apply"])).toEqual({
      cutoff: new Date("2026-10-14T12:00:00Z"),
      apply: true,
    });
    expect(parseArgs([])).toEqual({ error: `--cutoff is required.\n${USAGE}` });
    expect(parseArgs(["--cutoff=soon"])).toMatchObject({
      error: expect.stringMatching(/Not a date/),
    });
    expect(parseArgs(["--cutoff=2026-10-14", "--force"])).toMatchObject({
      error: expect.stringMatching(/Unknown argument: --force/),
    });
  });

  it("counts without writing in a dry run", async () => {
    const users = await seed();
    const before = await users.find({}).toArray();
    const report = await flagLegacyAccounts(mongoose.connection.db!, { cutoff, apply: false });
    expect(report).toEqual({
      cutoff: "2026-10-14T00:00:00.000Z",
      dryRun: true,
      totalUsers: 7,
      createdBeforeCutoff: 6,
      alreadyFlagged: 1,
      toFlag: 4,
      skippedNewFlow: 1,
      flagged: 0,
      nonDavidson: 1,
      verified: 1,
    });
    expect(await users.find({}).toArray()).toEqual(before);
    expect(formatReport(report, "makeitso")).toMatch(/^DRY RUN .*"makeitso"[\s\S]*would flag: +4/);
    expect(formatReport(report, "makeitso")).toMatch(/skipped \(unverified new sign-ups\): 1/);
  });

  it("flags only accounts created before the cutoff, and is idempotent", async () => {
    const users = await seed();
    const first = await flagLegacyAccounts(mongoose.connection.db!, { cutoff, apply: true });
    expect(first).toMatchObject({ dryRun: false, toFlag: 4, flagged: 4 });
    expect(
      (await users.find({ legacyAccount: true }).toArray()).map((u) => u.email).sort(),
    ).toEqual([
      "flagged@davidson.edu",
      "nodate@davidson.edu",
      "old1@davidson.edu",
      "old2@gmail.com",
      "old3@davidson.edu",
    ]);
    expect(await users.findOne({ email: "new@davidson.edu" })).not.toHaveProperty("legacyAccount");
    expect(await users.findOne({ email: "pending@davidson.edu" })).not.toHaveProperty(
      "legacyAccount",
    );
    const again = await flagLegacyAccounts(mongoose.connection.db!, { cutoff, apply: true });
    expect(again).toMatchObject({ toFlag: 0, flagged: 0, alreadyFlagged: 5, skippedNewFlow: 1 });
  });

  it("runs as a plain Node script (TypeScript stripped natively), dry run by default", async () => {
    await seed();
    const script = fileURLToPath(new URL("../../scripts/flag-legacy-accounts.ts", import.meta.url));
    const cwd = fileURLToPath(new URL("../..", import.meta.url));
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [script, "--cutoff=2026-10-14"],
      {
        cwd,
        env: { ...process.env, MONGODB_URI: testDb.uri, NODE_NO_WARNINGS: "1" },
      },
    );
    expect(stdout).toMatch(/^DRY RUN/);
    expect(stdout).toMatch(/would flag: +4/);
    const users = mongoose.connection.db!.collection("users");
    expect(await users.countDocuments({ legacyAccount: true })).toBe(1);

    const missing = await promisify(execFile)(process.execPath, [script], {
      cwd,
      env: { ...process.env, MONGODB_URI: testDb.uri, NODE_NO_WARNINGS: "1" },
    }).catch((error: { code?: number; stderr?: string }) => error);
    expect(missing).toMatchObject({ code: 2 });
  }, 60_000);
});
