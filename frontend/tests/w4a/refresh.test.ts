import type * as NextServer from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import FeedItem from "@/models/FeedItem";
import { getDb } from "@/server/db";
import { getLibraryHours, listEvents, listNews, syncFeeds } from "@/server/feeds";

/**
 * Stale-while-revalidate: reads never wait for an upstream, they schedule a refresh of stale sources with
 * next/server after(). Here after() is captured so the test decides when the "after the response" work runs.
 */
const scheduled = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof NextServer>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      scheduled.push(task);
    },
  };
});

async function runScheduled() {
  const tasks = scheduled.splice(0);
  for (const task of tasks) await task();
  return tasks.length;
}

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  scheduled.length = 0;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

describe("background refresh of stale feeds", () => {
  it("a read on a never-synced database returns what is stored and refreshes afterwards", async () => {
    expect(await listEvents()).toEqual([]);
    expect(scheduled).toHaveLength(1);
    expect(await runScheduled()).toBe(1);
    expect(await FeedItem.countDocuments()).toBeGreaterThan(90);
    expect((await listEvents()).length).toBeGreaterThan(20);
    // Everything is fresh now: nothing more to schedule.
    expect(scheduled).toHaveLength(0);
  });

  it("only stale requested sources are refreshed; refresh:false never schedules", async () => {
    await syncFeeds();
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T12:40:00-04:00");
    await listNews({ sources: ["davidsonian"] });
    expect(scheduled).toHaveLength(0);
    await listEvents({ sources: ["wildcatsync", "davidsonian"] }, { refresh: false });
    expect(scheduled).toHaveLength(0);
    await listEvents({ sources: ["wildcatsync", "davidsonian"] });
    expect(scheduled).toHaveLength(1);
    await runScheduled();
    const refreshed = await FeedItem.findOne({ source: "wildcatsync" }).lean();
    const untouched = await FeedItem.findOne({ source: "davidsonian" }).lean();
    expect(refreshed!.fetchedAt.toISOString()).toBe("2026-09-30T16:40:00.000Z");
    expect(untouched!.fetchedAt.toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("stale library hours are served immediately and refreshed in the background", async () => {
    await syncFeeds({ sources: ["library"] });
    await getLibraryHours("2026-09-30");
    expect(scheduled).toHaveLength(0);
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T12:31:00-04:00");
    const stale = await getLibraryHours("2026-09-30");
    expect(stale.fetchedAt).toBe("2026-09-30T16:00:00.000Z");
    expect(scheduled).toHaveLength(1);
    await runScheduled();
    expect((await getLibraryHours("2026-09-30")).fetchedAt).toBe("2026-09-30T16:31:00.000Z");
  });
});
