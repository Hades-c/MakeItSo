import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { DB_CONNECT_OPTIONS, disconnectDb, getDb, trusted } from "@/server/db";
import { EnvError, resetEnvCache } from "@/server/env";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
});

afterEach(async () => {
  await disconnectDb();
  process.env.MONGODB_URI = testDb.uri;
  resetEnvCache();
});

afterAll(async () => {
  await testDb.stop();
});

describe("getDb", () => {
  it("connects lazily and reuses one connection for concurrent callers", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    const [a, b] = await Promise.all([getDb(), getDb()]);
    expect(a).toBe(b);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.connected);

    await getDb();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("sanitizes query filters so request data cannot inject operators (PLAN §4.1.9)", async () => {
    await getDb();
    expect(mongoose.get("sanitizeFilter")).toBe(true);
    const Probe =
      mongoose.models.SanitizeProbe ??
      mongoose.model("SanitizeProbe", new mongoose.Schema({ email: String }));
    await Probe.create({ email: "a@davidson.edu" });
    // {"$ne": null} from a JSON body is wrapped in $eq, so it is a (failing) literal match, never an operator:
    // mongoose rejects it with a CastError (a 400 through defineRoute) instead of matching every document.
    const injected = JSON.parse('{"$ne": null}') as string;
    await expect(Probe.countDocuments({ email: injected })).rejects.toMatchObject({
      name: "CastError",
    });
    // Intentional operators are wrapped in trusted().
    expect(await Probe.countDocuments({ email: trusted({ $ne: null }) })).toBe(1);
  });

  it("uses a 5 s server selection timeout and no command buffering", () => {
    expect(DB_CONNECT_OPTIONS.serverSelectionTimeoutMS).toBe(5_000);
    expect(DB_CONNECT_OPTIONS.bufferCommands).toBe(false);
  });

  it("rejects with a clear EnvError when MONGODB_URI is missing, then recovers once it is set", async () => {
    delete process.env.MONGODB_URI;
    await expect(getDb()).rejects.toBeInstanceOf(EnvError);
    await expect(getDb()).rejects.toThrow(/MONGODB_URI is required/);

    process.env.MONGODB_URI = testDb.uri;
    await expect(getDb()).resolves.toBe(mongoose);
  });

  it("does not cache a failed connection attempt (resets and retries)", async () => {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:1/wave0-unreachable";
    const started = Date.now();
    await expect(getDb()).rejects.toThrow(/Server selection timed out|ECONNREFUSED/);
    const elapsed = Date.now() - started;
    // Fails after ~serverSelectionTimeoutMS instead of the driver's 30 s default.
    expect(elapsed).toBeLessThan(15_000);

    // The failure must not be replayed: pointing at a live server makes the very next call succeed.
    process.env.MONGODB_URI = testDb.uri;
    const db = await getDb();
    expect(db.connection.readyState).toBe(mongoose.ConnectionStates.connected);
    expect(db.connection.name).toBe(new URL(testDb.uri).pathname.slice(1));
  });
});
