import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubAuthEnv } from "../w3/helpers";
import { encryptV1 } from "./helpers";
import { insertStudent, setNow, withPlanDb } from "../plan/helpers";
import MoodleConnection from "@/models/MoodleConnection";
import Plan from "@/models/Plan";
import {
  eraseAccountData,
  exportAccountData,
  loadAccountDataRegistrations,
} from "@/server/account/erasers";
import {
  connectMoodle,
  disconnectMoodle,
  getMoodleStatus,
  isMoodleConnected,
  syncMoodle,
  syncMoodleIfDue,
} from "@/server/moodle";
import { encryptFeedUrl } from "@/server/moodle/crypto";
import { courseCodeFor, MOODLE_SYNCS_PER_HOUR } from "@/server/moodle/records";
import { addItem, listDeadlines } from "@/server/plan";
import { MAX_DEADLINES } from "@/server/plan/store";

/**
 * server/moodle against the fixture feeds (tests/fixtures/external/course-site): connect, dedupe and update by UID,
 * removal inside the feed's window, failures that keep what was imported, the encrypted URL, the sync limits,
 * disconnect and the account data. The fixture day is Wed Sep 30 2026, noon ET.
 */

withPlanDb();

const TOKENS = {
  good: "0123456789abcdef0123456789abcdef01234567",
  updated: "1111111111111111111111111111111111111111",
  badToken: "ffffffffffffffffffffffffffffffffffffffff",
  notMoodle: "2222222222222222222222222222222222222222",
  login: "3333333333333333333333333333333333333333",
  down: "5555555555555555555555555555555555555555",
} as const;

function feedUrl(token: string, what = "all"): string {
  return `https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=${token}&preset_what=${what}&preset_time=recentupcoming`;
}

/** Point a stored connection at another fixture feed (what Moodle would answer for the same link later). */
async function serveNext(userId: string, token: string): Promise<void> {
  await MoodleConnection.updateOne(
    { userId: new mongoose.Types.ObjectId(userId) },
    { $set: { feedUrl: encryptFeedUrl(feedUrl(token), userId) } },
  );
}

const logs: string[] = [];

beforeEach(() => {
  stubAuthEnv();
  logs.length = 0;
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(
        args.map((arg) => (arg instanceof Error ? `${arg.message}` : String(arg))).join(" "),
      );
    });
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  // Never the token or the URL in a log line, whatever happened.
  expect(logs.join("\n")).not.toMatch(/authtoken|[0-9a-f]{40}|export_execute/);
  await mongoose.connection.db?.collection("moodleconnections").deleteMany({});
});

async function studentWithCsc221(): Promise<string> {
  const userId = await insertStudent();
  await addItem(userId, {
    termCode: "202601",
    courseCode: "CSC 221",
    status: "registered",
    passFail: false,
    source: "catalog",
  });
  return userId;
}

describe("connectMoodle", () => {
  it("imports the feed's events as Moodle deadlines, with the course codes Moodle's course names give", async () => {
    const userId = await studentWithCsc221();
    const status = await connectMoodle(userId, feedUrl(TOKENS.good));
    expect(status).toMatchObject({
      connected: true,
      lastSyncedAt: "2026-09-30T16:00:00.000Z",
      problem: null,
      capped: 0,
    });
    expect(JSON.stringify(status)).not.toMatch(/authtoken|moodle\.davidson\.edu/);
    expect(status.deadlines.map((d) => [d.title, d.dueAt, d.courseCode ?? null, d.origin])).toEqual(
      [
        ["Reading quiz 1", "2026-09-20T03:59:00.000Z", "CSC 221", "moodle"],
        ["Problem set 2", "2026-09-26T03:59:00.000Z", "CSC 221", "moodle"],
        ["Problem set 3", "2026-10-02T03:59:00.000Z", "CSC 221", "moodle"],
        // ENG 260 is not in this student's plan, but it is a real course: the row still says which class.
        ["Response paper 2", "2026-10-03T03:00:00.000Z", "ENG 260", "moodle"],
        ["Quiz 2 closes", "2026-10-06T03:59:00.000Z", "CSC 221", "moodle"],
        ["Reading journal", "2026-10-09T03:59:00.000Z", "ENG 260", "moodle"],
        ["Advising worksheet", "2026-10-09T17:00:00.000Z", null, "moodle"],
        ["Final project proposal", "2026-10-21T03:59:00.000Z", "CSC 221", "moodle"],
      ],
    );
    // Moodle exported "Reading journal" as a date without a time: all day, never shown at 11:59 PM.
    expect(status.deadlines.filter((d) => d.allDay).map((d) => d.title)).toEqual([
      "Reading journal",
    ]);
    expect(await isMoodleConnected(userId)).toBe(true);
  });

  it("stores the URL encrypted, never in the clear", async () => {
    const userId = await studentWithCsc221();
    await connectMoodle(userId, feedUrl(TOKENS.good));
    const raw = await MoodleConnection.collection.findOne({
      userId: new mongoose.Types.ObjectId(userId),
    });
    expect(String(raw?.feedUrl)).toMatch(/^v2\./);
    expect(JSON.stringify(raw)).not.toMatch(new RegExp(`${TOKENS.good}|export_execute`));
  });

  it.each([
    ["a token Moodle refuses", TOKENS.badToken, 400, /did not accept that link/],
    ["a sign-in page", TOKENS.login, 400, /could not read as a calendar/],
    ["a calendar that is not Moodle's", TOKENS.notMoodle, 400, /could not read as a calendar/],
    ["Moodle down", TOKENS.down, 503, /did not answer/],
  ])("stores nothing for %s", async (_case, token, status, message) => {
    const userId = await insertStudent();
    await expect(connectMoodle(userId, feedUrl(token))).rejects.toMatchObject({
      status,
      message: expect.stringMatching(message),
    });
    expect(await isMoodleConnected(userId)).toBe(false);
    expect(await listDeadlines(userId)).toEqual([]);
  });

  it("checks the URL before fetching anything", async () => {
    const userId = await insertStudent();
    await expect(
      connectMoodle(userId, feedUrl(TOKENS.good).replace("moodle.davidson.edu", "evil.test")),
    ).rejects.toMatchObject({ status: 400 });
    expect(await isMoodleConnected(userId)).toBe(false);
  });
});

describe("syncMoodle", () => {
  it("updates by UID, removes what left the feed's window, keeps older history and the student's own", async () => {
    const userId = await studentWithCsc221();
    const first = await connectMoodle(userId, feedUrl(TOKENS.good));
    await Plan.updateOne(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        $push: {
          deadlines: {
            title: "Typed by hand",
            dueAt: new Date("2026-10-04T12:00:00Z"),
            origin: "manual",
          },
        },
      },
    );
    const idOf = (title: string) => first.deadlines.find((d) => d.title === title)?.id;

    await serveNext(userId, TOKENS.updated);
    const status = await syncMoodle(userId);
    expect(status.problem).toBeNull();
    const byTitle = new Map(status.deadlines.map((d) => [d.title, d]));
    // Moved: same deadline, new time.
    expect(byTitle.get("Problem set 3")).toMatchObject({
      id: idOf("Problem set 3"),
      dueAt: "2026-10-03T03:59:00.000Z",
    });
    // Renamed in Moodle: same deadline, new title.
    expect(byTitle.get("Response paper 2 (revised)")?.id).toBe(idOf("Response paper 2"));
    expect(byTitle.has("Response paper 2")).toBe(false);
    // Gone from the feed inside its window (the last 5 days onwards): removed.
    expect(byTitle.has("Quiz 2 closes")).toBe(false);
    // Gone from the feed but older than the window: kept as history.
    expect(byTitle.get("Reading quiz 1")?.id).toBe(idOf("Reading quiz 1"));
    // New in Moodle.
    expect(byTitle.has("Problem set 4")).toBe(true);
    expect(status.deadlines).toHaveLength(8);
    // The student's own deadline is untouched.
    expect((await listDeadlines(userId)).filter((d) => d.origin === "manual")).toHaveLength(1);
  });

  it("never duplicates a deadline when the same feed syncs again", async () => {
    const userId = await studentWithCsc221();
    const first = await connectMoodle(userId, feedUrl(TOKENS.good));
    const again = await syncMoodle(userId);
    expect(again.deadlines.map((d) => d.id)).toEqual(first.deadlines.map((d) => d.id));
    expect(await listDeadlines(userId)).toHaveLength(first.deadlines.length);
  });

  it("keeps the imported deadlines and says why when Moodle refuses the link later", async () => {
    const userId = await studentWithCsc221();
    const first = await connectMoodle(userId, feedUrl(TOKENS.good));
    await serveNext(userId, TOKENS.badToken);
    const status = await syncMoodle(userId);
    expect(status).toMatchObject({ connected: true, problem: "auth" });
    expect(status.lastSyncedAt).toBe(first.lastSyncedAt);
    expect(status.deadlines).toHaveLength(first.deadlines.length);

    await serveNext(userId, TOKENS.down);
    expect((await syncMoodle(userId)).problem).toBe("unreachable");
  });

  it("asks the student to reconnect when the encryption key changed", async () => {
    const userId = await studentWithCsc221();
    const first = await connectMoodle(userId, feedUrl(TOKENS.good));
    vi.stubEnv("NEXTAUTH_SECRET", "another-secret-that-is-long-enough-1234567890");
    const status = await syncMoodle(userId);
    expect(status.problem).toBe("key_changed");
    expect(status.deadlines).toHaveLength(first.deadlines.length);
    // Reconnecting with the same link works again.
    expect((await connectMoodle(userId, feedUrl(TOKENS.good))).problem).toBeNull();
  });

  it("never syncs a link copied from another student's connection", async () => {
    const owner = await studentWithCsc221();
    const other = await studentWithCsc221();
    await connectMoodle(owner, feedUrl(TOKENS.good));
    const first = await connectMoodle(other, feedUrl(TOKENS.updated));
    const stolen = await MoodleConnection.collection.findOne({
      userId: new mongoose.Types.ObjectId(owner),
    });
    await MoodleConnection.updateOne(
      { userId: new mongoose.Types.ObjectId(other) },
      { $set: { feedUrl: stolen?.feedUrl } },
    );
    const status = await syncMoodle(other);
    expect(status.problem).toBe("invalid");
    expect(status.deadlines.map((d) => d.title)).toEqual(first.deadlines.map((d) => d.title));
  });

  it("reads a link stored before owner binding (v1), and stores it again as v2", async () => {
    const userId = await studentWithCsc221();
    await connectMoodle(userId, feedUrl(TOKENS.good));
    const oid = new mongoose.Types.ObjectId(userId);
    await MoodleConnection.updateOne(
      { userId: oid },
      { $set: { feedUrl: encryptV1(feedUrl(TOKENS.updated), process.env.NEXTAUTH_SECRET!) } },
    );
    const status = await syncMoodle(userId);
    expect(status.problem).toBeNull();
    expect(status.deadlines.map((d) => d.title)).toContain("Problem set 4");
    const raw = await MoodleConnection.collection.findOne({ userId: oid });
    expect(String(raw?.feedUrl)).toMatch(/^v2\./);
    expect((await syncMoodle(userId)).problem).toBeNull();
  });

  it(`allows ${MOODLE_SYNCS_PER_HOUR} syncs an hour per student, then answers 429`, async () => {
    const userId = await studentWithCsc221();
    await connectMoodle(userId, feedUrl(TOKENS.good));
    for (let i = 1; i < MOODLE_SYNCS_PER_HOUR; i++) await syncMoodle(userId);
    await expect(syncMoodle(userId)).rejects.toMatchObject({ status: 429 });
    // Another student is not affected.
    const other = await studentWithCsc221();
    await expect(connectMoodle(other, feedUrl(TOKENS.good))).resolves.toMatchObject({
      connected: true,
    });
  });

  it("runs one sync at a time per student", async () => {
    const userId = await studentWithCsc221();
    await connectMoodle(userId, feedUrl(TOKENS.good));
    await MoodleConnection.updateOne(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: { syncLeaseUntil: new Date(Date.now() + 30_000) } },
    );
    await serveNext(userId, TOKENS.updated);
    const status = await syncMoodle(userId);
    // The held lease: nothing changed.
    expect(status.deadlines.some((d) => d.title === "Problem set 4")).toBe(false);
  });

  it("fits within the plan's deadline limit and counts what did not fit", async () => {
    const userId = await studentWithCsc221();
    await Plan.updateOne(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          deadlines: Array.from({ length: MAX_DEADLINES - 3 }, (_, i) => ({
            _id: new mongoose.Types.ObjectId(),
            title: `Own ${i}`,
            dueAt: new Date("2026-11-01T12:00:00Z"),
            origin: "manual",
          })),
        },
      },
    );
    const status = await connectMoodle(userId, feedUrl(TOKENS.good));
    // The soonest upcoming three.
    expect(status.deadlines.map((d) => d.title)).toEqual([
      "Problem set 3",
      "Response paper 2",
      "Quiz 2 closes",
    ]);
    expect(status.capped).toBe(5);
    expect(await listDeadlines(userId)).toHaveLength(MAX_DEADLINES);
  });
});

describe("syncMoodleIfDue (Today, /syllabi)", () => {
  it("syncs only when the last attempt is 6 hours old, and not while the student must reconnect", async () => {
    const userId = await studentWithCsc221();
    await connectMoodle(userId, feedUrl(TOKENS.good));
    await serveNext(userId, TOKENS.updated);
    const hasNew = async () =>
      (await getMoodleStatus(userId)).deadlines.some((d) => d.title === "Problem set 4");

    setNow("2026-09-30T17:59:00-04:00");
    await syncMoodleIfDue(userId);
    expect(await hasNew()).toBe(false);

    setNow("2026-09-30T18:00:00-04:00");
    await syncMoodleIfDue(userId);
    expect(await hasNew()).toBe(true);

    await serveNext(userId, TOKENS.badToken);
    setNow("2026-10-01T06:00:00-04:00");
    await syncMoodleIfDue(userId);
    expect((await getMoodleStatus(userId)).problem).toBe("auth");
    const attempted = (await getMoodleStatus(userId)).lastAttemptAt;
    setNow("2026-10-02T06:00:00-04:00");
    await syncMoodleIfDue(userId);
    expect((await getMoodleStatus(userId)).lastAttemptAt).toBe(attempted);
  });

  it("does nothing for a student who never connected", async () => {
    const userId = await insertStudent();
    await syncMoodleIfDue(userId);
    expect(await getMoodleStatus(userId)).toMatchObject({ connected: false, deadlines: [] });
  });
});

describe("disconnectMoodle", () => {
  it("forgets the link, and removes the imported deadlines only when asked", async () => {
    const a = await studentWithCsc221();
    const b = await studentWithCsc221();
    await connectMoodle(a, feedUrl(TOKENS.good));
    await connectMoodle(b, feedUrl(TOKENS.good));

    expect(await disconnectMoodle(a, { removeDeadlines: false })).toEqual({ removed: 0 });
    expect(await getMoodleStatus(a)).toMatchObject({ connected: false });
    expect((await getMoodleStatus(a)).deadlines).toHaveLength(8);

    expect(await disconnectMoodle(b, { removeDeadlines: true })).toEqual({ removed: 8 });
    expect(await listDeadlines(b)).toEqual([]);
    // Idempotent.
    expect(await disconnectMoodle(b, { removeDeadlines: true })).toEqual({ removed: 0 });
  });
});

describe("account data", () => {
  it("exports the connection without its URL, and erases it", async () => {
    await loadAccountDataRegistrations();
    const userId = await studentWithCsc221();
    await connectMoodle(userId, feedUrl(TOKENS.good));
    const exported = await exportAccountData(userId);
    expect(exported.moodle).toMatchObject({
      feedUrl: expect.stringMatching(/not included/),
      lastSyncedAt: expect.any(Date),
    });
    expect(JSON.stringify(exported.moodle)).not.toMatch(/v[12]\.|authtoken/);
    // The imported deadlines are part of the plan's export.
    expect(JSON.stringify(exported.plans)).toContain("Problem set 3");

    const removed = await eraseAccountData(userId);
    expect(removed.moodle).toBe(1);
    expect(await isMoodleConnected(userId)).toBe(false);
  });

  it("exports and erases nothing for an invalid id", async () => {
    await loadAccountDataRegistrations();
    expect((await exportAccountData("not-an-id")).moodle).toBeNull();
    expect((await eraseAccountData("not-an-id")).moodle).toBe(0);
  });
});

describe("courseCodeFor", () => {
  const codes = new Set(["CSC 221", "ENG 260", "BIO 395"]);
  it("prefers a plan course, then a catalog course, and never makes one up", () => {
    const catalog = new Set(["MAT 110", "CSC 221", "HIS 357"]);
    expect(courseCodeFor("MAT 110 and CSC 221", codes, catalog)).toBe("CSC 221");
    expect(courseCodeFor("MAT110-A-F26", codes, catalog)).toBe("MAT 110");
    expect(courseCodeFor("ABC 123 Club", codes, catalog)).toBeUndefined();
  });
  it.each([
    ["CSC221-A-F26", "CSC 221"],
    ["202601_CSC_221_A", "CSC 221"],
    ["csc 221 a fall 2026", "CSC 221"],
    ["ENG-260 Section B", "ENG 260"],
    ["CSC 2210", undefined],
    ["MAT 110", undefined],
    ["First-Year Advising F26", undefined],
    [null, undefined],
  ])("%s → %s", (category, code) => {
    expect(courseCodeFor(category, codes)).toBe(code);
  });
});
