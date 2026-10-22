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
  stubNowPlus,
  storedSessionVersion,
} from "./helpers";
import { POST as resend } from "@/app/api/account/verify/resend/route";
import { POST as confirm } from "@/app/api/auth/password-reset/confirm/route";
import { POST as confirmLink } from "@/app/api/auth/password-reset/link/route";
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
  RESET_LINK_MESSAGE,
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
const postLink = (body: unknown) =>
  confirmLink(jsonRequest("/api/auth/password-reset/link", { body }));

/** The token of the reset link in the last e-mail to `email` (/forgot-password#token=…). */
function linkTokenOf(email: string): string {
  const text = lastConsoleMessage(email)?.text ?? "";
  const match = /\/forgot-password#token=(\S+)/.exec(text);
  if (!match) throw new Error(`no reset link in the last e-mail to ${email}`);
  return decodeURIComponent(match[1]!);
}

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
          interests: ["financial-planning"],
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
        interests: ["financial-planning"],
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
      interests: ["financial-planning"],
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
    // The next e-mail carries the link alone: codes stay locked, and the link still resets.
    await RateLimit.deleteMany({ key: /^(reset-(request|confirm):ip|reset-send)/ });
    await postRequest(owner.email);
    const locked = lastConsoleMessage(owner.email)!;
    expect(locked.code).toBeUndefined();
    expect(locked.text).toContain("This e-mail has no code");
    await RateLimit.deleteMany({ key: /^reset-(request|confirm):ip/ });
    expect(
      (
        await postLink({
          token: linkTokenOf(owner.email),
          newPassword: "the owner's new passphrase",
        })
      ).status,
    ).toBe(200);
  });
});

describe("the e-mailed reset link (abuse fix: someone else's wrong codes cannot block the owner)", () => {
  it("comes with the code, resets once, signs out everywhere and answers the address", async () => {
    const user = await insertUser({
      email: "casey@davidson.edu",
      raw: { emailVerifiedAt: new Date("2026-09-01"), sessionVersion: 3 },
    });
    await postRequest(user.email);
    const message = lastConsoleMessage(user.email)!;
    expect(message.code).toMatch(/^\d{6}$/);
    const token = linkTokenOf(user.email);
    expect(token).toMatch(new RegExp(`^${user.id}\\.[A-Za-z0-9_-]{22}$`));
    // Only the link's HMAC is stored.
    const stored = await VerificationCode.collection.findOne({ purpose: "reset-password" });
    expect(stored?.linkHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token.split(".")[1]);

    const res = await postLink({ token, newPassword: "brand new passphrase" });
    expect(await answer(res)).toEqual({ status: 200, body: { email: "casey@davidson.edu" } });
    const after = await User.collection.findOne({ email: user.email });
    expect(await bcrypt.compare("brand new passphrase", String(after?.password))).toBe(true);
    expect(after?.sessionVersion).toBe(4);
    // Once: the link and the code are both used up.
    expect((await postLink({ token, newPassword: "another new passphrase" })).status).toBe(400);
    expect(
      (await postConfirm({ email: user.email, code: message.code, newPassword: "x passphrase 2" }))
        .status,
    ).toBe(400);
  });

  it("works after an attacker has burned the code's attempts and the day's wrong codes", async () => {
    const owner = await insertUser({
      email: "casey@davidson.edu",
      raw: { emailVerifiedAt: new Date("2026-09-01") },
    });
    await postRequest(owner.email);
    const code = lastConsoleMessage(owner.email)!.code!;
    const token = linkTokenOf(owner.email);
    for (let i = 0; i < 5; i++) {
      await RateLimit.deleteMany({ key: /^reset-confirm:ip/ });
      await postConfirm({
        email: owner.email,
        code: code === "000000" ? "111111" : "000000",
        newPassword: "attacker passphrase",
      });
    }
    // The code itself is dead now (5 attempts), but the link is not.
    await RateLimit.deleteMany({ key: /^reset-confirm:ip/ });
    expect(
      (await postConfirm({ email: owner.email, code, newPassword: "owner passphrase one" })).status,
    ).toBe(400);
    const res = await postLink({ token, newPassword: "owner passphrase one" });
    expect(res.status).toBe(200);
  });

  it("refuses a wrong, replaced or expired link with the same 400, and keeps it after a weak password", async () => {
    const user = await insertUser({
      email: "casey@davidson.edu",
      raw: { emailVerifiedAt: new Date("2026-09-01") },
    });
    await postRequest(user.email);
    const first = linkTokenOf(user.email);
    const linkError = {
      status: 400,
      body: { error: { issues: [{ path: "token", message: RESET_LINK_MESSAGE }] } },
    };
    const wrong = `${user.id}.${"A".repeat(22)}`;
    expect(
      await answer(await postLink({ token: wrong, newPassword: "a fine passphrase" })),
    ).toMatchObject(linkError);
    const otherUser = `${"0".repeat(24)}.${first.split(".")[1]}`;
    expect(
      await answer(await postLink({ token: otherUser, newPassword: "a fine passphrase" })),
    ).toMatchObject(linkError);
    // A malformed token never reaches the lookup.
    expect((await postLink({ token: "nope", newPassword: "a fine passphrase" })).status).toBe(400);

    // A weak password is refused on its own field, and the link stays usable.
    const weak = await answer(await postLink({ token: first, newPassword: "password123" }));
    expect(weak).toMatchObject({
      status: 400,
      body: { error: { issues: [{ path: "newPassword" }] } },
    });

    // A newer e-mail replaces the link.
    await postRequest(user.email);
    const second = linkTokenOf(user.email);
    expect(second).not.toBe(first);
    expect(
      await answer(await postLink({ token: first, newPassword: "a fine passphrase" })),
    ).toMatchObject(linkError);

    // 15 minutes later it has expired.
    stubNowPlus(15 * 60_000 + 1);
    expect(
      await answer(await postLink({ token: second, newPassword: "a fine passphrase" })),
    ).toMatchObject(linkError);
  });

  it("verifies an unverified legacy account like a code does, clearing its AI consent", async () => {
    const legacy = await insertUser({
      email: "owner.legacy@gmail.com",
      raw: { aiConsentAt: new Date("2026-01-01"), adultAttestedAt: new Date("2026-01-01") },
    });
    await postRequest(legacy.email);
    expect(
      (await postLink({ token: linkTokenOf(legacy.email), newPassword: "legacy owner passphrase" }))
        .status,
    ).toBe(200);
    const doc = await User.collection.findOne({ email: legacy.email });
    expect(doc?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(doc).not.toHaveProperty("aiConsentAt");
  });
});
