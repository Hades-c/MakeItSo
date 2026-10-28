import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubAuthEnv } from "../w3/helpers";
import { insertStudent, withPlanDb } from "../plan/helpers";
import MoodleConnection from "@/models/MoodleConnection";
import Plan from "@/models/Plan";
import { eraseAccountData, loadAccountDataRegistrations } from "@/server/account/erasers";
import { connectMoodle, disconnectMoodle, getMoodleStatus, syncMoodle } from "@/server/moodle";
import { listDeadlines, replaceMoodleDeadlines, startMoodleImport } from "@/server/plan";

/**
 * A Moodle sync that is still running when the student disconnects, connects another feed or deletes their
 * account writes nothing (server/plan/moodle.ts moodleImportId). The window is the plan read between the feed and
 * the write (server/moodle/records.ts planCourseCodes → getPlan): `duringSync` runs there, once.
 */

let duringSync: (() => Promise<void>) | null = null;

vi.mock("@/server/plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/plan")>();
  return {
    ...actual,
    getPlan: async (...args: Parameters<typeof actual.getPlan>) => {
      const hook = duringSync;
      duringSync = null;
      if (hook) await hook();
      return actual.getPlan(...args);
    },
  };
});

withPlanDb();

const GOOD = "0123456789abcdef0123456789abcdef01234567";
const UPDATED = "1111111111111111111111111111111111111111";
const feedUrl = (token: string) =>
  `https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=${token}&preset_what=all&preset_time=recentupcoming`;

beforeEach(() => {
  stubAuthEnv();
  duringSync = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mongoose.connection.db?.collection("moodleconnections").deleteMany({});
});

describe("a sync still running", () => {
  it("does not put the deadlines back after disconnect removed them", async () => {
    const userId = await insertStudent();
    await connectMoodle(userId, feedUrl(GOOD));
    duringSync = async () => {
      expect(await disconnectMoodle(userId, { removeDeadlines: true })).toEqual({ removed: 8 });
    };
    await syncMoodle(userId);
    expect(duringSync).toBeNull();
    expect(await listDeadlines(userId)).toEqual([]);
    expect(await getMoodleStatus(userId)).toMatchObject({ connected: false, deadlines: [] });
  });

  it("does not replace a newly connected feed's deadlines, or mark it synced", async () => {
    const userId = await insertStudent();
    await connectMoodle(userId, feedUrl(GOOD));
    // The stale sync's feed is GOOD; while it runs, the student connects UPDATED.
    duringSync = async () => {
      await connectMoodle(userId, feedUrl(UPDATED));
    };
    await syncMoodle(userId);
    expect(duringSync).toBeNull();
    const titles = (await listDeadlines(userId)).map((d) => d.title);
    expect(titles).toContain("Problem set 4");
    expect(titles).toContain("Response paper 2 (revised)");
    expect(titles).not.toContain("Response paper 2");
    // And the next sync reads the new link (the old sync left the connection and its lease alone).
    const raw = await MoodleConnection.collection.findOne({
      userId: new mongoose.Types.ObjectId(userId),
    });
    expect(raw?.syncLeaseUntil).toBeNull();
    expect((await syncMoodle(userId)).deadlines.map((d) => d.title)).toContain("Problem set 4");
  });

  it("does not recreate the plan of an account deleted meanwhile", async () => {
    await loadAccountDataRegistrations();
    const userId = await insertStudent();
    await connectMoodle(userId, feedUrl(GOOD));
    duringSync = async () => {
      await eraseAccountData(userId);
    };
    await syncMoodle(userId);
    expect(duringSync).toBeNull();
    expect(await Plan.countDocuments({ userId: new mongoose.Types.ObjectId(userId) })).toBe(0);
  });
});

describe("replaceMoodleDeadlines", () => {
  it("writes nothing for an import that is not the plan's", async () => {
    const userId = await insertStudent();
    const first = await startMoodleImport(userId);
    await startMoodleImport(userId);
    const event = {
      uid: "1@moodle.davidson.edu",
      title: "Essay",
      dueAt: "2026-10-02T03:59:00.000Z",
    };
    const windowStart = new Date("2026-09-25T00:00:00Z");
    expect(await replaceMoodleDeadlines(userId, [event], { windowStart, importId: first })).toBe(
      null,
    );
    expect(await listDeadlines(userId)).toEqual([]);
    // Never a plan for a student who has none.
    const other = await insertStudent();
    expect(
      await replaceMoodleDeadlines(other, [event], { windowStart, importId: first }),
    ).toBeNull();
    expect(await Plan.countDocuments({ userId: new mongoose.Types.ObjectId(other) })).toBe(0);
  });
});
