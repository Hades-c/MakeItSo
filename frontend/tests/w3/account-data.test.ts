import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, stubAuthEnv } from "./helpers";
import RateLimit from "@/models/RateLimit";
import {
  accountDataNames,
  eraseAccountData,
  exportAccountData,
  loadAccountDataRegistrations,
} from "@/server/account/erasers";
import { issueCode } from "@/server/auth/codes";
import { loginBackoffKey, recordLoginFailure } from "@/server/auth/rate-limits";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await RateLimit.createIndexes();
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const at = new Date("2026-09-30T16:00:00Z");

function counter(key: string) {
  return { key, windowStart: new Date(0), count: 1, expiresAt: new Date("2030-01-01") };
}

describe("W3 in the account data registry (PLAN §4.1.12, §9)", () => {
  it("registers verificationcodes and ratelimits from the server/auth entry module", async () => {
    await loadAccountDataRegistrations();
    expect(accountDataNames()).toEqual(
      expect.arrayContaining(["courseplans-legacy", "ratelimits", "verificationcodes"]),
    );
  });

  it("exports and erases only this account's codes and counters", async () => {
    const me = await insertUser({ email: "me@davidson.edu" });
    const other = await insertUser({ email: "other@davidson.edu" });
    await issueCode(me.id, me.email, "verify-email", at);
    await issueCode(me.id, me.email, "reset-password", at);
    await issueCode(other.id, other.email, "verify-email", at);
    await recordLoginFailure(me.email, at);
    await recordLoginFailure(other.email, at);
    await RateLimit.collection.insertMany([
      counter(`export:user:${me.id}`),
      counter(`verify-resend:user:${me.id}`),
      counter(`export:user:${other.id}`),
      counter(`export:user:${me.id}x`),
      counter("login:ip:203.0.113.7"),
    ]);

    const exported = await exportAccountData(me.id);
    expect((exported.verificationcodes as unknown[]).length).toBe(2);
    expect(JSON.stringify(exported.verificationcodes)).not.toContain("codeHash");
    expect((exported.ratelimits as { key: string }[]).map((r) => r.key).sort()).toEqual(
      [`export:user:${me.id}`, loginBackoffKey(me.email), `verify-resend:user:${me.id}`].sort(),
    );

    const removed = await eraseAccountData(me.id);
    expect(removed).toMatchObject({ verificationcodes: 2, ratelimits: 3 });
    const left = (await RateLimit.collection.find({}).toArray()).map((r) => r.key).sort();
    expect(left).toEqual(
      [
        `export:user:${me.id}x`,
        `export:user:${other.id}`,
        "login:ip:203.0.113.7",
        loginBackoffKey(other.email),
      ].sort(),
    );
    expect((await exportAccountData(other.id)).verificationcodes).toHaveLength(1);
  });

  it("never throws for ids that are not ObjectIds", async () => {
    expect(await exportAccountData("not-an-id")).toMatchObject({
      verificationcodes: [],
      ratelimits: [],
    });
    expect(await eraseAccountData("not-an-id")).toMatchObject({
      verificationcodes: 0,
      ratelimits: 0,
    });
    expect(await eraseAccountData(new mongoose.Types.ObjectId().toString())).toMatchObject({
      ratelimits: 0,
    });
  });
});
