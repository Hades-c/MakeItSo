import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import SourceSync from "@/models/SourceSync";
import { getDb } from "@/server/db";
import { getSourceStatuses, recordSync, SYNC_MAX_AGE_MS } from "@/server/sync";

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

const at = (iso: string) => new Date(iso);

describe("recordSync / getSourceStatuses (PLAN §4.1.11)", () => {
  it("lists only sources that have synced, in registry order", async () => {
    expect(await getSourceStatuses()).toEqual([]);
    await recordSync("wildcatsync", { ok: true, count: 143, at: at("2026-09-30T14:00:00Z") });
    await recordSync("course-schedule", { ok: true, count: 676, at: at("2026-09-30T14:10:00Z") });
    const rows = await getSourceStatuses(at("2026-09-30T14:20:00Z"));
    expect(rows.map((row) => row.id)).toEqual(["course-schedule", "wildcatsync"]);
    expect(rows[0]).toEqual({
      id: "course-schedule",
      label: "Course schedule",
      lastSync: at("2026-09-30T14:10:00Z"),
      lastAttemptAt: at("2026-09-30T14:10:00Z"),
      status: "ok",
      count: 676,
      error: null,
    });
  });

  it("keeps the last success through failures and reports the error", async () => {
    await recordSync("library", { ok: true, count: 11, at: at("2026-09-30T12:00:00Z") });
    await recordSync("library", {
      ok: false,
      count: 0,
      error: "Upstream answered 503",
      at: at("2026-09-30T13:00:00Z"),
    });
    await recordSync("library", {
      ok: false,
      count: 0,
      error: "x".repeat(900),
      at: at("2026-09-30T14:00:00Z"),
    });
    const [row] = await getSourceStatuses(at("2026-09-30T14:05:00Z"));
    expect(row).toMatchObject({
      id: "library",
      status: "error",
      lastSync: at("2026-09-30T12:00:00Z"),
      lastAttemptAt: at("2026-09-30T14:00:00Z"),
      count: 11,
    });
    expect(row?.error).toHaveLength(500);
    const doc = await SourceSync.findOne({ sourceId: "library" }).lean();
    expect(doc?.consecutiveFailures).toBe(2);

    await recordSync("library", { ok: true, count: 12, at: at("2026-09-30T15:00:00Z") });
    const [recovered] = await getSourceStatuses(at("2026-09-30T15:01:00Z"));
    expect(recovered).toMatchObject({ status: "ok", count: 12, error: null });
    expect((await SourceSync.findOne({ sourceId: "library" }).lean())?.consecutiveFailures).toBe(0);
  });

  it("marks a source stale when its last success is too old", async () => {
    const last = at("2026-09-30T08:00:00Z");
    await recordSync("course-schedule", { ok: true, count: 676, at: last });
    const later = new Date(last.getTime() + SYNC_MAX_AGE_MS["course-schedule"] + 1);
    expect((await getSourceStatuses(later))[0]?.status).toBe("stale");
  });

  it("records a source that never succeeded as an error with no last sync", async () => {
    await recordSync("davidsonian", { ok: false, count: 0 });
    const [row] = await getSourceStatuses();
    expect(row).toMatchObject({ status: "error", lastSync: null, error: "Unknown error" });
  });

  it("rejects ids that are not synced sources and bad counts", async () => {
    await expect(recordSync("handshake" as never, { ok: true, count: 1 })).rejects.toThrow(
      TypeError,
    );
    await expect(recordSync("library", { ok: true, count: -1 })).rejects.toThrow(TypeError);
  });

  it("is safe under concurrent first syncs", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => recordSync("hurt-hub", { ok: true, count: 9 })),
    );
    expect(await SourceSync.countDocuments({ sourceId: "hurt-hub" })).toBe(1);
  });
});
