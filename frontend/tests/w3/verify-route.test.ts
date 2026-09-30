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
} from "./helpers";
import { POST as verify } from "@/app/api/account/verify/route";
import { POST as resend } from "@/app/api/account/verify/resend/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as me } from "@/app/api/me/route";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import VerificationCode from "@/models/VerificationCode";
import { clearConsoleOutbox, lastConsoleMessage } from "@/server/auth/mailer";
import { getDb } from "@/server/db";
import { defineRoute, isVerifiedDavidson } from "@/server/http";

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

const EMAIL = "casey@davidson.edu";

/** Register through the route, sign in as the new account, and return the e-mailed code. */
async function registerAndSignIn(email = EMAIL) {
  const res = await register(
    jsonRequest("/api/auth/register", {
      body: { name: "Casey", email, password: "correct horse battery" },
    }),
  );
  expect(res.status).toBe(202);
  const doc = await User.findOne({ email }).lean();
  auth.session = await sessionFor({ id: doc!._id.toString(), email, name: "Casey" });
  return { id: doc!._id.toString(), code: lastConsoleMessage(email)!.code! };
}

const postVerify = (code: string) => verify(jsonRequest("/api/account/verify", { body: { code } }));
const postResend = () => resend(jsonRequest("/api/account/verify/resend"));
const wrongCode = (code: string) => (code === "000000" ? "111111" : "000000");

/** A route only verified @davidson.edu accounts may use (defineRoute auth "verified"). */
const verifiedOnly = defineRoute({ method: "GET", auth: "verified" }, () => ({ ok: true }));
const adminOnly = defineRoute({ method: "GET", auth: "admin" }, () => ({ ok: true }));

describe("POST /api/account/verify", () => {
  it("needs a session", async () => {
    expect((await postVerify("123456")).status).toBe(401);
    expect((await postResend()).status).toBe(401);
  });

  it("verifies the mailbox with the e-mailed code, which unlocks 'verified' routes", async () => {
    const { id, code } = await registerAndSignIn();
    expect((await verifiedOnly(getRequest("/x"))).status).toBe(403);

    const res = await postVerify(code);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res.json()) as { verified: true; emailVerifiedAt: string };
    expect(body).toEqual({ verified: true, emailVerifiedAt: "2026-09-30T16:00:00.000Z" });
    expect((await User.findById(id).lean())?.emailVerifiedAt?.toISOString()).toBe(
      body.emailVerifiedAt,
    );

    expect(await isVerifiedDavidson(id)).toBe(true);
    expect((await verifiedOnly(getRequest("/x"))).status).toBe(200);
    const meBody = (await (await me(getRequest("/api/me"))).json()) as { me: object };
    expect(meBody.me).toMatchObject({ verifiedDavidson: true, onboarded: false });

    // Verifying again is harmless and keeps the first time.
    stubNowPlus(60_000);
    expect(await (await postVerify("999999")).json()).toEqual(body);
  });

  it("counts wrong codes down, then refuses (429) until a new code is sent", async () => {
    const { code } = await registerAndSignIn();
    const first = await postVerify(wrongCode(code));
    expect(first.status).toBe(400);
    expect((await errorOf(first)).issues).toEqual([
      { path: "code", message: "That code is not right. 4 attempts left." },
    ]);
    for (let i = 0; i < 3; i++) expect((await postVerify(wrongCode(code))).status).toBe(400);
    const fifth = await postVerify(wrongCode(code));
    expect(fifth.status).toBe(429);
    expect((await errorOf(fifth)).message).toMatch(/Too many wrong codes/);
    expect((await postVerify(code)).status).toBe(429);

    expect((await postResend()).status).toBe(202);
    const fresh = lastConsoleMessage(EMAIL)!.code!;
    expect((await postVerify(fresh)).status).toBe(200);
  });

  it("refuses an expired code", async () => {
    const { code } = await registerAndSignIn();
    stubNowPlus(15 * 60_000 + 1000);
    const res = await postVerify(code);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).issues?.[0]?.message).toMatch(/expired/);
  });

  it("validates the body strictly", async () => {
    await registerAndSignIn();
    for (const body of [
      { code: "12345" },
      { code: "abcdef" },
      { code: 123456 },
      { code: "123456", extra: 1 },
      {},
    ]) {
      expect((await verify(jsonRequest("/api/account/verify", { body }))).status).toBe(400);
    }
    expect(
      (
        await verify(
          jsonRequest("/api/account/verify", {
            body: { code: "123456" },
            headers: { origin: "https://evil.example" },
          }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("POST /api/account/verify/resend", () => {
  it("sends a new code (the old one stops working), 3 per hour including the registration e-mail", async () => {
    const { code } = await registerAndSignIn();
    const res = await postResend();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ sent: true });
    const second = lastConsoleMessage(EMAIL)!.code!;
    if (second !== code) expect((await postVerify(code)).status).toBe(400);

    expect((await postResend()).status).toBe(202);
    const limited = await postResend();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    stubNowPlus(3600_000);
    expect((await postResend()).status).toBe(202);
  });

  it("answers 503 while no mail provider is configured", async () => {
    await registerAndSignIn();
    vi.stubEnv("MAIL_PROVIDER", "none");
    const res = await postResend();
    expect(res.status).toBe(503);
    expect((await errorOf(res)).message).toMatch(/not available yet/);
  });

  it("says sent: false for an account that is already verified", async () => {
    const user = await insertUser({ email: EMAIL, raw: { emailVerifiedAt: new Date() } });
    auth.session = await sessionFor(user);
    expect(await (await postResend()).json()).toEqual({ sent: false });
  });
});

describe("any account may verify its own mailbox (PLAN §9)", () => {
  it("a legacy gmail account verifies, satisfies ADMIN_EMAILS, but stays out of alumni/AI", async () => {
    const owner = await insertUser({ email: "owner.legacy@gmail.com" });
    auth.session = await sessionFor(owner);
    vi.stubEnv("ADMIN_EMAILS", "owner.legacy@gmail.com");
    expect((await adminOnly(getRequest("/x"))).status).toBe(403);

    expect((await postResend()).status).toBe(202);
    const code = lastConsoleMessage("owner.legacy@gmail.com")!.code!;
    expect((await postVerify(code)).status).toBe(200);

    expect((await adminOnly(getRequest("/x"))).status).toBe(200);
    expect(await isVerifiedDavidson(owner.id)).toBe(false);
    expect((await verifiedOnly(getRequest("/x"))).status).toBe(403);
    const meBody = (await (await me(getRequest("/api/me"))).json()) as { me: object };
    expect(meBody.me).toMatchObject({ email: "owner.legacy@gmail.com", verifiedDavidson: false });
  });
});
