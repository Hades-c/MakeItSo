import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { RmpCronResultSchema } from "@/lib/types/ratings";
import RmpTeacher from "@/models/RmpTeacher";
import SourceSync from "@/models/SourceSync";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import type * as ExternalModule from "@/server/http/external";
import { fetchExternal } from "@/server/http/external";
import { ROSTER_INTERVAL_DAYS, runRmpCron } from "@/server/rmp/cron";

vi.mock("@/server/http/external", async (importOriginal) => {
  const actual = await importOriginal<typeof ExternalModule>();
  return { ...actual, fetchExternal: vi.fn(actual.fetchExternal) };
});

const DAY_MS = 864e5;

/** The roster requests among the RateMyProfessors calls so far (the tag requests carry no school id). */
function rosterRequests(): number {
  return vi
    .mocked(fetchExternal)
    .mock.calls.filter(([, , options]) => JSON.stringify(options?.body).includes("newSearch"))
    .length;
}

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.mocked(fetchExternal).mockClear();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

describe("runRmpCron", () => {
  it("syncs the roster, then counts the tags of every rated teacher", async () => {
    const result = RmpCronResultSchema.parse(await runRmpCron());
    expect(result).toEqual({
      roster: { ok: true, count: 31, rejectedOtherSchool: 2, skipped: false },
      tags: { ok: true, updated: 27, remaining: 0, requests: 3, outOfTime: false },
    });
    expect(rosterRequests()).toBe(1);
  });

  it("keeps the roster weekly: skipped while the last good sync is under six days old", async () => {
    await runRmpCron();
    const synced = now();
    vi.mocked(fetchExternal).mockClear();

    vi.stubEnv("FIXTURES_NOW", new Date(synced.getTime() + 5.9 * DAY_MS).toISOString());
    expect(await runRmpCron()).toEqual({
      roster: { skipped: true, lastSuccessAt: synced.toISOString() },
      tags: { ok: true, updated: 0, remaining: 0, requests: 0, outOfTime: false },
    });
    expect(fetchExternal).not.toHaveBeenCalled();

    vi.stubEnv(
      "FIXTURES_NOW",
      new Date(synced.getTime() + ROSTER_INTERVAL_DAYS * DAY_MS).toISOString(),
    );
    expect((await runRmpCron()).roster).toEqual({
      ok: true,
      count: 31,
      rejectedOtherSchool: 2,
      skipped: false,
    });
    expect(rosterRequests()).toBe(1);
  });

  it("retries the roster the next day after a failed sync (only a success counts)", async () => {
    await SourceSync.create({
      sourceId: "ratemyprofessors",
      ok: false,
      lastAttemptAt: now(),
      lastSuccessAt: new Date(now().getTime() - 7 * DAY_MS),
    });
    expect((await runRmpCron()).roster).toMatchObject({ ok: true, skipped: false });
  });

  it("hands the tag counts what is left of the budget", async () => {
    // A clock where the roster step takes 4 minutes: no time is left for a tag request.
    let ms = 0;
    const clock = () => (ms += 120_000);
    expect((await runRmpCron({ clock, budgetMs: 240_000 })).tags).toEqual({
      ok: true,
      updated: 0,
      remaining: 27,
      requests: 0,
      outOfTime: true,
    });
    expect(await RmpTeacher.countDocuments()).toBe(31);
  });

  it("with RMP_ENABLED=false does nothing: no request, nothing stored or recorded", async () => {
    vi.stubEnv("RMP_ENABLED", "false");
    expect(await runRmpCron()).toEqual({
      roster: {
        ok: false,
        count: 0,
        rejectedOtherSchool: 0,
        error: "RateMyProfessors ratings are turned off (RMP_ENABLED=false).",
        skipped: false,
      },
      tags: {
        ok: false,
        updated: 0,
        remaining: 0,
        requests: 0,
        outOfTime: false,
        error: "RateMyProfessors ratings are turned off (RMP_ENABLED=false).",
      },
    });
    expect(fetchExternal).not.toHaveBeenCalled();
    expect(await SourceSync.countDocuments()).toBe(0);
    expect(await RmpTeacher.countDocuments()).toBe(0);
  });
});
