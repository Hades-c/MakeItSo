import type { Session } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import {
  errorOf,
  getRequest,
  insertUser,
  jsonRequest,
  sessionFor,
  stubAuthEnv,
  storedSessionVersion,
} from "./helpers";
import { POST as confirm } from "@/app/api/auth/password-reset/confirm/route";
import { POST as request } from "@/app/api/auth/password-reset/route";
import { GET as me } from "@/app/api/me/route";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import VerificationCode from "@/models/VerificationCode";
import { clearConsoleOutbox, consoleOutbox, lastConsoleMessage } from "@/server/auth/mailer";
import { authorizeCredentials } from "@/server/auth/options";
import {
  RESET_CHECK_INBOX_MESSAGE,
  RESET_CODE_MESSAGE,
  RESET_UNAVAILABLE_MESSAGE,
} from "@/server/auth/password-reset";
import { loginBackoffKey, recordLoginFailure } from "@/server/auth/rate-limits";
import { getDb } from "@/server/db";

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await Promise.all([
    User.createIndexes(),
    RateLimit.createIndexes(),
    VerificationCode.createIndexes(),
  ]);
});

beforeEach(() => {
  stubAuthEnv();
  clearConsoleOutbox();
});

afterEach(async () => {
  auth.session = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const postRequest = (email: unknown) =>
  request(jsonRequest("/api/auth/password-reset", { body: { email } }));
const postConfirm = (body: unknown) =>
  confirm(jsonRequest("/api/auth/password-reset/confirm", { body }));

async function answer(res: Response) {
  return { status: res.status, body: (await res.json()) as unknown };
}

describe("POST /api/auth/password-reset", () => {
  it("answers the same 202 for known and unknown addresses, and only e-mails real accounts", async () => {
    await insertUser({ email: "casey@davidson.edu" });
    const expected = {
      status: 202,
      body: { status: "check-inbox", message: RESET_CHECK_INBOX_MESSAGE },
    };
    expect(await answer(await postRequest("Casey@Davidson.edu"))).toEqual(expected);
    expect(await answer(await postRequest("ghost@davidson.edu"))).toEqual(expected);
    expect(consoleOutbox().map((m) => [m.to, m.kind])).toEqual([
      ["casey@davidson.edu", "reset-password"],
    ]);
    expect(lastConsoleMessage("casey@davidson.edu")?.code).toMatch(/^\d{6}$/);
  });

  it("works for legacy non-Davidson accounts too", async () => {
    await insertUser({ email: "owner.legacy@gmail.com" });
    expect((await postRequest("owner.legacy@gmail.com")).status).toBe(202);
    expect(lastConsoleMessage("owner.legacy@gmail.com")?.kind).toBe("reset-password");
  });

  it("sends at most 3 codes an hour per account, and allows 5 requests an hour per IP", async () => {
    await insertUser({ email: "casey@davidson.edu" });
    for (let i = 0; i < 5; i++) expect((await postRequest("casey@davidson.edu")).status).toBe(202);
    expect(consoleOutbox()).toHaveLength(3);
    expect((await postRequest("casey@davidson.edu")).status).toBe(429);
  });

  it("is unavailable (503) without a mail provider", async () => {
    vi.stubEnv("MAIL_PROVIDER", "none");
    const res = await postRequest("casey@davidson.edu");
    expect(res.status).toBe(503);
    expect((await errorOf(res)).message).toBe(RESET_UNAVAILABLE_MESSAGE);
    expect(
      (
        await postConfirm({
          email: "a@davidson.edu",
          code: "123456",
          newPassword: "brand new passphrase",
        })
      ).status,
    ).toBe(503);
  });

  it("validates the body", async () => {
    expect((await postRequest("not an email")).status).toBe(400);
    expect(
      (
        await request(
          jsonRequest("/api/auth/password-reset", { body: { email: "a@davidson.edu", x: 1 } }),
        )
      ).status,
    ).toBe(400);
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  it("sets the new password, signs out everywhere, verifies the mailbox and ends the backoff", async () => {
    const user = await insertUser({
      email: "casey@davidson.edu",
      raw: { emailVerifiedAt: null, sessionVersion: 0 },
    });
    auth.session = await sessionFor(user);
    await recordLoginFailure("casey@davidson.edu", "local", new Date("2026-09-30T16:00:00Z"));
    await recordLoginFailure("casey@davidson.edu", "203.0.113.9", new Date("2026-09-30T16:00:00Z"));
    await postRequest("casey@davidson.edu");
    const code = lastConsoleMessage("casey@davidson.edu")!.code!;

    const res = await postConfirm({
      email: "casey@davidson.edu",
      code,
      newPassword: "brand new passphrase",
    });
    expect(res.status).toBe(204);
    expect(await storedSessionVersion(user.id)).toBe(1);
    expect((await me(getRequest("/api/me"))).status).toBe(401);
    expect((await User.findById(user.id).lean())?.emailVerifiedAt?.toISOString()).toBe(
      "2026-09-30T16:00:00.000Z",
    );
    for (const key of [
      loginBackoffKey("casey@davidson.edu"),
      loginBackoffKey("casey@davidson.edu", "local"),
      loginBackoffKey("casey@davidson.edu", "203.0.113.9"),
    ]) {
      expect(await RateLimit.collection.countDocuments({ key })).toBe(0);
    }
    expect(await authorizeCredentials({ email: user.email, password: user.password })).toBeNull();
    expect(
      await authorizeCredentials({ email: user.email, password: "brand new passphrase" }),
    ).not.toBeNull();

    // The code works once.
    expect(
      (
        await postConfirm({
          email: "casey@davidson.edu",
          code,
          newPassword: "another new passphrase",
        })
      ).status,
    ).toBe(400);
  });

  it("answers every code failure with the same 400, known address or not", async () => {
    await insertUser({ email: "casey@davidson.edu" });
    await postRequest("casey@davidson.edu");
    const code = lastConsoleMessage("casey@davidson.edu")!.code!;
    const wrong = code === "000000" ? "111111" : "000000";
    const bodies = [
      { email: "casey@davidson.edu", code: wrong, newPassword: "brand new passphrase" },
      { email: "ghost@davidson.edu", code: wrong, newPassword: "brand new passphrase" },
    ];
    const errors = [];
    for (const body of bodies) {
      const res = await postConfirm(body);
      expect(res.status).toBe(400);
      errors.push(await errorOf(res));
    }
    expect(errors[0]).toEqual(errors[1]);
    expect(errors[0]?.issues).toEqual([{ path: "code", message: RESET_CODE_MESSAGE }]);
    // After 5 wrong codes even the right one fails, still with the same answer.
    for (let i = 0; i < 4; i++) await postConfirm(bodies[0]);
    const late = await postConfirm({ ...bodies[0], code });
    expect(late.status).toBe(400);
    expect(await errorOf(late)).toEqual(errors[0]);
  });

  it("checks the new-password policy before anything else", async () => {
    const res = await postConfirm({
      email: "ghost@davidson.edu",
      code: "123456",
      newPassword: "1234567890",
    });
    expect((await errorOf(res)).issues?.[0]).toMatchObject({ path: "newPassword" });
  });

  it("lets the inbox owner take over an unverified sign-up someone else started (first to verify wins)", async () => {
    const squat = await insertUser({
      email: "victim@davidson.edu",
      password: "squatter password",
      raw: { emailVerifiedAt: null, sessionVersion: 0 },
    });
    const squatterSession = await sessionFor(squat);
    await postRequest("victim@davidson.edu");
    const code = lastConsoleMessage("victim@davidson.edu")!.code!;
    expect(
      (await postConfirm({ email: "victim@davidson.edu", code, newPassword: "the real owner now" }))
        .status,
    ).toBe(204);

    auth.session = squatterSession;
    expect((await me(getRequest("/api/me"))).status).toBe(401);
    expect(
      await authorizeCredentials({ email: "victim@davidson.edu", password: "squatter password" }),
    ).toBeNull();
    const owner = await authorizeCredentials({
      email: "victim@davidson.edu",
      password: "the real owner now",
    });
    expect(owner).toMatchObject({ id: squat.id });
    expect((await User.findById(squat.id).lean())?.emailVerifiedAt).toBeInstanceOf(Date);
  });
});
