import bcrypt from "bcryptjs";
import type { JWT } from "next-auth/jwt";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, stubAuthEnv, stubNowPlus } from "./helpers";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import {
  authorizeCredentials,
  getAuthOptions,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_MAX_AGE_SEC,
  SignInRefusedError,
  signInClientIp,
} from "@/server/auth/options";
import { signInErrorMessage } from "@/app/(auth)/_lib/sign-in-errors";
import { loginBackoffKey } from "@/server/auth/rate-limits";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await Promise.all([User.createIndexes(), RateLimit.createIndexes()]);
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

describe("authorizeCredentials (PLAN §6.1 W3 sign-in)", () => {
  it("signs in with the normalised address and returns the session version", async () => {
    const user = await insertUser({
      email: "alex.wildcat@davidson.edu",
      raw: { sessionVersion: 3, emailVerifiedAt: null },
    });
    const signedIn = await authorizeCredentials({
      email: "  ALEX.Wildcat@Davidson.EDU ",
      password: user.password,
    });
    expect(signedIn).toEqual({
      id: user.id,
      email: "alex.wildcat@davidson.edu",
      name: user.name,
      sessionVersion: 3,
    });
  });

  it("keeps legacy non-Davidson accounts working (no domain check)", async () => {
    // A hackathon-era document: no emailVerifiedAt, no sessionVersion, legacy profile fields.
    const legacy = await insertUser({
      email: "owner.legacy@gmail.com",
      raw: { major: "Computer Science", currentYear: "Junior", totalCreditsRequired: 128 },
    });
    expect(
      await authorizeCredentials({ email: "Owner.Legacy@Gmail.com", password: legacy.password }),
    ).toMatchObject({ id: legacy.id, email: "owner.legacy@gmail.com", sessionVersion: 0 });
  });

  it("finds a legacy address stored without NFKC normalisation", async () => {
    // Stored the old way (trim + lower case only): a full-width letter survives.
    const legacy = await insertUser({ email: "ｐat@example.com" });
    expect(
      await authorizeCredentials({ email: " ｐat@example.com", password: legacy.password }),
    ).toMatchObject({ id: legacy.id });
  });

  it("answers wrong password and unknown address the same way, comparing a dummy hash", async () => {
    const user = await insertUser({ email: "casey@davidson.edu" });
    const compare = vi.spyOn(bcrypt, "compare");
    expect(
      await authorizeCredentials({ email: user.email, password: "not the password" }),
    ).toBeNull();
    expect(
      await authorizeCredentials({ email: "nobody@davidson.edu", password: "not the password" }),
    ).toBeNull();
    // One bcrypt comparison each: against the real hash, then against the dummy hash.
    expect(compare).toHaveBeenCalledTimes(2);
    expect(INVALID_CREDENTIALS_MESSAGE).toBe("Invalid email or password");
  });

  it("ignores missing or absurd input without touching the database", async () => {
    const find = vi.spyOn(User, "findOne");
    expect(await authorizeCredentials(undefined)).toBeNull();
    expect(await authorizeCredentials({ email: "a@davidson.edu" })).toBeNull();
    expect(await authorizeCredentials({ email: "   ", password: "x" })).toBeNull();
    expect(
      await authorizeCredentials({ email: "a@davidson.edu", password: "x".repeat(5000) }),
    ).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("backs off after 5 failures for an address, even with the right password, then recovers", async () => {
    const user = await insertUser({ email: "casey@davidson.edu" });
    for (let i = 0; i < 5; i++) {
      expect(await authorizeCredentials({ email: user.email, password: "wrong wrong" })).toBeNull();
    }
    const refused = await authorizeCredentials({
      email: user.email,
      password: user.password,
    }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SignInRefusedError);
    expect(refused).toMatchObject({ kind: "backoff", retryAfterSec: 30 });
    // The error value NextAuth passes on is a fixed code; the login form builds the sentence.
    expect((refused as Error).message).toBe("AddressBackoff:30");
    expect(signInErrorMessage((refused as Error).message)).toBe(
      "Too many failed sign-in attempts for this address. Wait 30 seconds and try again.",
    );

    stubNowPlus(31_000);
    expect(
      await authorizeCredentials({ email: user.email, password: user.password }),
    ).toMatchObject({ id: user.id });
    // Success ends this IP's streak (the address-wide count stays for the ceiling).
    expect(
      await RateLimit.collection.countDocuments({ key: loginBackoffKey(user.email, "local") }),
    ).toBe(0);
  });

  it("backs off the guessing IP, not the student's (review regression: sustainable lockout)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const user = await insertUser({ email: "casey@davidson.edu" });
    const attacker = { headers: { "x-real-ip": "203.0.113.66" } };
    const student = { headers: { "x-real-ip": "198.51.100.20" } };
    for (let i = 0; i < 5; i++) {
      await authorizeCredentials({ email: user.email, password: "wrong wrong" }, attacker);
    }
    await expect(
      authorizeCredentials({ email: user.email, password: "wrong wrong" }, attacker),
    ).rejects.toMatchObject({ kind: "backoff" });
    expect(
      await authorizeCredentials({ email: user.email, password: user.password }, student),
    ).toMatchObject({ id: user.id });
  });

  it("backs off unknown addresses exactly like real ones (no account oracle)", async () => {
    for (let i = 0; i < 5; i++) {
      await authorizeCredentials({ email: "ghost@davidson.edu", password: "wrong wrong" });
    }
    const error = await authorizeCredentials({
      email: "ghost@davidson.edu",
      password: "wrong wrong",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignInRefusedError);
    expect(error).toMatchObject({ kind: "backoff" });
  });

  it("limits FAILED sign-in attempts to 10 per 15 minutes per client IP", async () => {
    // Successful sign-ins (a campus NAT address, the register form's automatic sign-in) do not count.
    const student = await insertUser({ email: "busy@davidson.edu" });
    for (let i = 0; i < 25; i++) {
      expect(
        await authorizeCredentials({ email: student.email, password: student.password }),
      ).toMatchObject({ id: student.id });
    }
    for (let i = 0; i < 10; i++) {
      await authorizeCredentials({ email: `p${i}@davidson.edu`, password: "wrong wrong" });
    }
    await expect(
      authorizeCredentials({ email: "p99@davidson.edu", password: "wrong wrong" }),
    ).rejects.toMatchObject({
      kind: "ip-limit",
      message: expect.stringMatching(/^TooManyAttempts:\d+$/),
    });
    stubNowPlus(15 * 60_000);
    expect(
      await authorizeCredentials({ email: "p99@davidson.edu", password: "wrong wrong" }),
    ).toBeNull();
  });

  it("trusts x-real-ip / the first X-Forwarded-For only on Vercel", async () => {
    const headers = { "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.9, 10.0.0.1" };
    expect(signInClientIp({ headers })).toBe("local");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(signInClientIp({ headers })).toBe("203.0.113.7");
    expect(signInClientIp({ headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" } })).toBe(
      "198.51.100.9",
    );
    expect(signInClientIp({ headers: new Headers({ "x-real-ip": "192.0.2.4" }) })).toBe(
      "192.0.2.4",
    );

    for (let i = 0; i < 10; i++) {
      await authorizeCredentials(
        { email: `q${i}@davidson.edu`, password: "wrong wrong" },
        { headers: { "x-real-ip": "203.0.113.7" } },
      );
    }
    await expect(
      authorizeCredentials(
        { email: "q@davidson.edu", password: "wrong wrong" },
        { headers: { "x-real-ip": "203.0.113.7" } },
      ),
    ).rejects.toThrow(SignInRefusedError);
    expect(
      await authorizeCredentials(
        { email: "q@davidson.edu", password: "wrong wrong" },
        { headers: { "x-real-ip": "198.51.100.1" } },
      ),
    ).toBeNull();
  });
});

describe("NextAuth options", () => {
  it("uses 14-day JWT sessions and the /login pages", () => {
    const options = getAuthOptions();
    expect(options.secret).toBeTruthy();
    expect(options.session).toMatchObject({ strategy: "jwt", maxAge: 14 * 24 * 60 * 60 });
    expect(options.jwt?.maxAge).toBe(SESSION_MAX_AGE_SEC);
    expect(options.pages).toEqual({ signIn: "/login", error: "/login" });
    expect(getAuthOptions()).toBe(options);
  });

  it("puts the session version in the token and the session, and never refreshes it on update()", async () => {
    const user = await insertUser({ raw: { sessionVersion: 2 } });
    const { jwt, session } = getAuthOptions().callbacks!;
    const token = (await jwt!({
      token: {},
      user: { id: user.id, email: user.email, name: user.name, sessionVersion: 2 },
      account: null,
      trigger: "signIn",
    } as never)) as JWT;
    expect(token).toMatchObject({ id: user.id, sv: 2, email: user.email });

    await User.updateOne({ _id: user.id }, { $set: { name: "Renamed" } });
    const updated = (await jwt!({ token, trigger: "update" } as never)) as JWT;
    expect(updated).toMatchObject({ name: "Renamed", sv: 2 });

    const built = await session!({
      session: { user: {}, expires: "2026-10-14T00:00:00.000Z" },
      token: updated,
    } as never);
    expect(built.user).toMatchObject({ id: user.id, name: "Renamed", sessionVersion: 2 });

    // A bumped version (sign out everywhere, password change) revokes the token for good, update() included.
    await User.updateOne({ _id: user.id }, { $inc: { sessionVersion: 1 } });
    const revoked = (await jwt!({ token: updated, trigger: "update" } as never)) as JWT;
    expect(revoked).toEqual({ revoked: true });
    expect(await jwt!({ token: revoked } as never)).toEqual({ revoked: true });
  });

  it("GET /api/auth/session agrees with revocation: a revoked token gets an empty session", async () => {
    const user = await insertUser({ raw: { sessionVersion: 0 } });
    const { jwt, session } = getAuthOptions().callbacks!;
    const token = (await jwt!({
      token: {},
      user: { id: user.id, email: user.email, name: user.name, sessionVersion: 0 },
      account: null,
      trigger: "signIn",
    } as never)) as JWT;
    // A later request with the same, still current, token keeps the user.
    const again = (await jwt!({ token } as never)) as JWT;
    expect(again).toMatchObject({ id: user.id, sv: 0 });

    await User.updateOne({ _id: user.id }, { $inc: { sessionVersion: 1 } });
    const after = (await jwt!({ token: again } as never)) as JWT;
    expect(after).toEqual({ revoked: true });
    const body = await session!({
      session: {
        user: { name: user.name, email: user.email },
        expires: "2026-10-14T00:00:00.000Z",
      },
      token: after,
    } as never);
    expect(body).toEqual({});

    // A deleted account's token is revoked too.
    await User.deleteOne({ _id: user.id });
    expect(await jwt!({ token: again } as never)).toEqual({ revoked: true });
  });

  it("keeps the token when the version cannot be read (no sign-out during a database outage)", async () => {
    const user = await insertUser({ raw: { sessionVersion: 0 } });
    const { jwt } = getAuthOptions().callbacks!;
    const token = { id: user.id, sv: 0, email: user.email, name: user.name };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(User, "findById").mockImplementationOnce(() => {
      throw new Error("connection refused");
    });
    expect(await jwt!({ token } as never)).toMatchObject({ id: user.id, sv: 0 });
    expect(warn).toHaveBeenCalled();
  });

  it("passes refusals through and hides database errors behind a generic message", async () => {
    const provider = getAuthOptions().providers[0] as unknown as {
      options: { authorize: (c: unknown, r: unknown) => Promise<unknown> };
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(User, "findOne").mockImplementationOnce(() => {
      throw new Error("connection refused");
    });
    await expect(
      provider.options.authorize({ email: "a@davidson.edu", password: "x y z w v u" }, {}),
    ).rejects.toThrow(/^SignInUnavailable$/);
    expect(signInErrorMessage("SignInUnavailable")).toBe(
      "Sign-in is temporarily unavailable. Please try again in a moment.",
    );
    expect(logged).toHaveBeenCalled();

    for (let i = 0; i < 5; i++) {
      await provider.options.authorize({ email: "b@davidson.edu", password: "x y z w v u" }, {});
    }
    await expect(
      provider.options.authorize({ email: "b@davidson.edu", password: "x y z w v u" }, {}),
    ).rejects.toThrow(/^AddressBackoff:\d+$/);
  });
});
