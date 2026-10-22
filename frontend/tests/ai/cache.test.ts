import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import AiCache from "@/models/AiCache";
import {
  deletePersonal,
  hashInput,
  readPersonal,
  readShared,
  stableJson,
  writePersonal,
  writeShared,
} from "@/server/ai/cache";
import { getDb } from "@/server/db";

/** aicache_v2 access: hashing, shared vs personal scope, logical expiry, negative entries. */

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

const USER = "64b0000000000000000000a1";
const OTHER = "64b0000000000000000000b2";

const entry = (overrides: Partial<Parameters<typeof writeShared>[2]> = {}) => ({
  inputHash: "hash-1",
  promptVersion: "course-about/1",
  status: "ok" as const,
  data: { summary: "S", goodFor: [], topics: [] },
  servedModel: "claude-sonnet-5-5",
  fallbackUsed: false,
  ttlMs: 30 * 86_400_000,
  ...overrides,
});

describe("hashing", () => {
  it("is independent of key order and drops undefined", () => {
    expect(stableJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    expect(hashInput({ a: 1, b: 2 })).toBe(hashInput({ b: 2, a: 1 }));
    expect(hashInput({ a: 1 })).not.toBe(hashInput({ a: 2 }));
    expect(hashInput({})).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("shared and personal entries", () => {
  it("round-trips a shared entry with provenance", async () => {
    const provenance = await writeShared("course-about", "key-1", entry());
    expect(provenance).toEqual({
      model: "claude-sonnet-5-5",
      promptVersion: "course-about/1",
      inputHash: "hash-1",
      generatedAt: "2026-09-30T16:00:00.000Z",
    });
    const read = await readShared("course-about", "key-1");
    expect(read).toMatchObject({
      status: "ok",
      data: { summary: "S" },
      provenance,
      hidden: false,
      reports: 0,
    });
    expect(await readShared("professor-summary", "key-1")).toBeNull();
    expect(await readPersonal("course-about", USER, "key-1")).toBeNull();
  });

  it("keeps personal entries per student", async () => {
    await writePersonal("plan-suggestions", USER, "202602", entry({ data: { mine: true } }));
    expect((await readPersonal("plan-suggestions", USER, "202602"))?.data).toEqual({ mine: true });
    expect(await readPersonal("plan-suggestions", OTHER, "202602")).toBeNull();
    expect(await readShared("plan-suggestions", "202602")).toBeNull();
    await deletePersonal("plan-suggestions", USER, "202602");
    expect(await readPersonal("plan-suggestions", USER, "202602")).toBeNull();
  });

  it("refreshes an entry in place, keeping its reports", async () => {
    await writeShared("course-about", "key-1", entry());
    await AiCache.updateOne({ key: "key-1" }, { $set: { "reports.userIds": [USER] } });
    await writeShared(
      "course-about",
      "key-1",
      entry({ inputHash: "hash-2", data: { summary: "T", goodFor: [], topics: [] } }),
    );
    const read = await readShared("course-about", "key-1");
    expect(read).toMatchObject({ inputHash: "hash-2", data: { summary: "T" }, reports: 1 });
    expect(await AiCache.countDocuments()).toBe(1);
  });

  it("stores negative entries without data", async () => {
    await writeShared(
      "course-about",
      "key-1",
      entry({ status: "refused", data: null, message: "No.", ttlMs: 86_400_000 }),
    );
    expect(await readShared("course-about", "key-1")).toMatchObject({
      status: "refused",
      data: null,
      message: "No.",
    });
  });

  it("ignores entries after their logical end (server now), whatever the purge time", async () => {
    await writeShared("course-about", "key-1", entry({ ttlMs: 86_400_000 }));
    vi.stubEnv("FIXTURES_NOW", "2026-10-01T11:00:00-04:00");
    expect(await readShared("course-about", "key-1")).not.toBeNull();
    vi.stubEnv("FIXTURES_NOW", "2026-10-01T13:00:00-04:00");
    expect(await readShared("course-about", "key-1")).toBeNull();
    const [doc] = await AiCache.find().lean();
    expect(doc!.expiresAt.getTime()).toBeGreaterThanOrEqual(doc!.validUntil.getTime());
    expect(doc!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
