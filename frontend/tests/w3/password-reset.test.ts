import bcrypt from "bcryptjs";
import mongoose from "mongoose";
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
import { POST as resend } from "@/app/api/account/verify/resend/route";
import { POST as confirm } from "@/app/api/auth/password-reset/confirm/route";
import { POST as request } from "@/app/api/auth/password-reset/route";
import { GET as me } from "@/app/api/me/route";
import { PUT as grantConsent } from "@/app/api/profile/ai-consent/route";
import { PATCH as patchProfile } from "@/app/api/profile/route";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import VerificationCode from "@/models/VerificationCode";
import { clearConsoleOutbox, consoleOutbox, lastConsoleMessage } from "@/server/auth/mailer";
import { authorizeCredentials } from "@/server/auth/options";
import {
  nameFromEmail,
  RESET_CHECK_INBOX_MESSAGE,
  RESET_CODE_MESSAGE,
  RESET_UNAVAILABLE_MESSAGE,
} from "@/server/auth/password-reset";
import { isVerifiedDavidsonUser } from "@/server/auth/session";
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

  it("does the same work for an unknown address: bcrypt first, then the same code lookups (timing)", async () => {
    await insertUser({ email: "casey@davidson.edu" });
    const hash = vi.spyOn(bcrypt, "hash");
    const lookup = vi.spyOn(VerificationCode, "findOneAndUpdate");
    const body = { code: "123456", newPassword: "brand new passphrase" };
    await postConfirm({ ...body, email: "casey@davidson.edu" });
    await postConfirm({ ...body, email: "ghost@davidson.edu" });
    expect(hash).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});

describe("a reset that verifies an unverified account is a change of owner (review regression)", () => {
  const VICTIM = "minor.student@davidson.edu";

  it("starts a squatted sign-up fresh: no squatter consent, 18+ attestation, profile or data survives", async () => {
    const squat = await insertUser({
      email: VICTIM,
      name: "Squatter",
      password: "squatter password",
      raw: { emailVerifiedAt: null, sessionVersion: 0, graduationYear: 2027 },
    });
    auth.session = await sessionFor(squat);
    const patched = await patchProfile(
      jsonRequest("/api/profile", {
        method: "PATCH",
        body: {
          name: "Not The Victim",
          interests: ["finance"],
          standingOverride: "senior",
          adultAttested: true,
          aiConsent: true,
          onboarded: true,
        },
      }),
    );
    expect(patched.status).toBe(200);
    expect(
      (
        await grantConsent(
          jsonRequest("/api/profile/ai-consent", { method: "PUT", body: { adultAttested: true } }),
        )
      ).status,
    ).toBe(200);
    await CoursePlanV1.collection.insertOne({
      userId: new mongoose.Types.ObjectId(squat.id),
      plannedCourses: [{ code: "HIS 101" }],
    });
    auth.session = null;

    await postRequest(VICTIM);
    const mail = lastConsoleMessage(VICTIM)!;
    // The e-mail tells the inbox owner what the reset does.
    expect(mail.text).toMatch(/starts it fresh/);
    const res = await postConfirm({
      email: VICTIM,
      code: mail.code!,
      newPassword: "the real owner now",
    });
    expect(res.status).toBe(204);

    const doc = await User.collection.findOne({ email: VICTIM });
    expect(doc?._id.toString()).toBe(squat.id);
    expect(doc?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(doc?.name).toBe("Minor Student");
    for (const field of [
      "aiConsentAt",
      "adultAttestedAt",
      "onboardedAt",
      "interests",
      "standingOverride",
      "majors",
      "verificationSentAt",
    ]) {
      expect(doc, field).not.toHaveProperty(field);
    }
    expect(doc?.graduationYear).toBe(2030);
    expect(isVerifiedDavidsonUser(doc as never)).toBe(true);
    // Every account-data eraser ran (the legacy plan, codes and counters are gone).
    expect(await CoursePlanV1.collection.countDocuments({ userId: doc?._id })).toBe(0);
    expect(await VerificationCode.countDocuments({ userId: doc?._id })).toBe(0);
    expect(await storedSessionVersion(squat.id)).toBe(1);
  });

  it("keeps a legacy account's data but clears consent and the attestation it had before verifying", async () => {
    const legacy = await insertUser({
      email: "legacy.student@davidson.edu",
      raw: {
        major: "History",
        bio: "old bio",
        aiConsentAt: new Date("2026-09-01"),
        adultAttestedAt: new Date("2026-09-01"),
        onboardedAt: new Date("2026-09-01"),
      },
    });
    await postRequest(legacy.email);
    const code = lastConsoleMessage(legacy.email)!.code!;
    expect(lastConsoleMessage(legacy.email)!.text).not.toMatch(/starts it fresh/);
    expect(
      (await postConfirm({ email: legacy.email, code, newPassword: "a new legacy pw" })).status,
    ).toBe(204);
    const doc = await User.collection.findOne({ email: legacy.email });
    expect(doc).toMatchObject({ name: legacy.name, major: "History", bio: "old bio" });
    expect(doc?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(doc?.onboardedAt).toBeInstanceOf(Date);
    expect(doc).not.toHaveProperty("aiConsentAt");
    expect(doc).not.toHaveProperty("adultAttestedAt");
  });

  it("changes only the password of a verified account", async () => {
    const verifiedAt = new Date("2026-09-01T00:00:00Z");
    const user = await insertUser({
      email: "casey@davidson.edu",
      raw: {
        emailVerifiedAt: verifiedAt,
        aiConsentAt: verifiedAt,
        adultAttestedAt: verifiedAt,
        interests: ["finance"],
      },
    });
    await postRequest(user.email);
    const code = lastConsoleMessage(user.email)!.code!;
    expect(
      (await postConfirm({ email: user.email, code, newPassword: "brand new passphrase" })).status,
    ).toBe(204);
    expect(await User.collection.findOne({ email: user.email })).toMatchObject({
      name: user.name,
      emailVerifiedAt: verifiedAt,
      aiConsentAt: verifiedAt,
      adultAttestedAt: verifiedAt,
      interests: ["finance"],
    });
  });

  it("names a fresh account from its address", () => {
    expect(nameFromEmail("casey.wildcat@davidson.edu")).toBe("Casey Wildcat");
    expect(nameFromEmail("ab_cd-ef+x@davidson.edu")).toBe("Ab Cd Ef X");
    expect(nameFromEmail("..@davidson.edu")).toBe("Davidson student");
  });
});

describe("the reset wrong-code budget (review regression: slow brute force)", () => {
  it("an unverified account's reset and verification codes share one send budget", async () => {
    const pending = await insertUser({
      email: "pending@davidson.edu",
      raw: { emailVerifiedAt: null },
    });
    for (let i = 0; i < 3; i++) await postRequest(pending.email);
    expect(consoleOutbox().filter((m) => m.to === pending.email)).toHaveLength(3);
    // The first reset code reached the inbox: the 24 h replacement window starts.
    expect((await User.findById(pending.id).lean())?.verificationSentAt).toEqual(
      new Date("2026-09-30T16:00:00Z"),
    );
    auth.session = await sessionFor(pending);
    expect((await resend(jsonRequest("/api/account/verify/resend"))).status).toBe(429);
  });

  it("stops sending and checking reset codes once the account's 10 wrong codes are used up", async () => {
    const owner = await insertUser({
      email: "owner.legacy@gmail.com",
      raw: { emailVerifiedAt: new Date("2026-09-01") },
    });
    let wrong = 0;
    for (let send = 0; send < 3; send++) {
      await RateLimit.deleteMany({ key: /^reset-(request|confirm):ip/ }); // an attacker rotating IPs
      await postRequest(owner.email);
      const code = lastConsoleMessage(owner.email)!.code!;
      for (let i = 0; i < 5; i++) {
        await RateLimit.deleteMany({ key: /^reset-(request|confirm):ip/ });
        const res = await postConfirm({
          email: owner.email,
          code: code === "000000" ? "111111" : "000000",
          newPassword: "attacker passphrase",
        });
        expect(res.status).toBe(400);
        wrong++;
      }
    }
    expect(wrong).toBe(15);
    const counter = await RateLimit.collection.findOne({ key: `reset-fail:user:${owner.id}` });
    // Only 10 guesses were actually compared; the rest were refused unchecked (same 400).
    expect(counter?.count).toBeGreaterThanOrEqual(10);
    const mailsBefore = consoleOutbox().length;
    await RateLimit.deleteMany({ key: /^(reset-(request|confirm):ip|reset-send)/ });
    await postRequest(owner.email);
    expect(consoleOutbox()).toHaveLength(mailsBefore);
  });
});
