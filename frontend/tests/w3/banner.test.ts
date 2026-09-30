import type { Session } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, sessionFor, stubAuthEnv, stubNowPlus } from "./helpers";
import { verifyBannerFor } from "@/server/auth/banner";
import { resolveSessionUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";

const auth = vi.hoisted(() => ({ session: null as Session | null }));

vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
// connection() needs a Next.js request scope; the tests call pages' helpers directly.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  auth.session = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

describe("the hub's verify banner", () => {
  it("verifyBannerFor shows only unverified @davidson.edu accounts, while mail is available", async () => {
    // The 24 h replacement window starts with the first code sent, not at sign-up (review regression).
    const fresh = await insertUser({
      email: "fresh@davidson.edu",
      raw: {
        emailVerifiedAt: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        verificationSentAt: new Date("2026-09-30T16:00:00Z"),
      },
    });
    const signedIn = (await resolveSessionUser(await sessionFor(fresh)))!;
    stubNowPlus(5 * 3_600_000);
    expect(await verifyBannerFor(signedIn, now())).toEqual({
      email: "fresh@davidson.edu",
      replaceable: true,
      hoursLeft: 19,
    });

    // Never sent a code (e.g. created while mail was off): not replaceable, however old.
    const neverSent = await insertUser({
      email: "never.sent@davidson.edu",
      raw: { emailVerifiedAt: null, createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    expect(
      await verifyBannerFor((await resolveSessionUser(await sessionFor(neverSent)))!, now()),
    ).toEqual({ email: "never.sent@davidson.edu", replaceable: false, hoursLeft: null });

    const legacy = await insertUser({ email: "legacy@davidson.edu" });
    expect(
      await verifyBannerFor((await resolveSessionUser(await sessionFor(legacy)))!, now()),
    ).toEqual({ email: "legacy@davidson.edu", replaceable: false, hoursLeft: null });

    const gmail = await insertUser({ email: "legacy@gmail.com" });
    expect(
      await verifyBannerFor((await resolveSessionUser(await sessionFor(gmail)))!, now()),
    ).toBeNull();

    const verified = await insertUser({
      email: "done@davidson.edu",
      raw: { emailVerifiedAt: new Date() },
    });
    expect(
      await verifyBannerFor((await resolveSessionUser(await sessionFor(verified)))!, now()),
    ).toBeNull();
    expect(await verifyBannerFor(null, now())).toBeNull();

    vi.stubEnv("MAIL_PROVIDER", "none");
    expect(await verifyBannerFor(signedIn, now())).toBeNull();
  });
});
