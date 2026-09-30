import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { POST as register } from "@/app/api/auth/register/route";
import CoursePlan from "@/models/CoursePlan";
import User from "@/models/User";
import { authorizeCredentials, getAuthOptions } from "@/server/auth/options";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

function registerRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const alex = {
  name: "Alex Wildcat",
  email: "Alex.Wildcat@Davidson.edu",
  password: "correct horse",
};

describe("POST /api/auth/register", () => {
  it("creates the user (lower-cased email, hashed password) and writes no legacy course plan", async () => {
    const res = await register(registerRequest(alex));
    expect(res.status).toBe(201);
    const { userId } = (await res.json()) as { userId: string };

    const user = await User.findById(userId).select("+password").lean();
    expect(user?.email).toBe("alex.wildcat@davidson.edu");
    expect(user?.major).toBe("Undecided");
    expect(user?.password).toMatch(/^\$2[aby]\$12\$/);
    expect(user?.password).not.toContain(alex.password);

    // Legacy collections are read-only to new code (PLAN §4).
    expect(await CoursePlan.countDocuments({ userId })).toBe(0);
  });

  it("returns 409 for an email that is already registered (case-insensitive)", async () => {
    expect((await register(registerRequest(alex))).status).toBe(201);
    const res = await register(registerRequest({ ...alex, email: "alex.wildcat@davidson.edu" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "conflict", message: "An account with that email already exists" },
    });
  });

  it("returns typed 400 errors for invalid input and malformed JSON", async () => {
    const invalid = await register(registerRequest({ name: "", email: "nope", password: "short" }));
    expect(invalid.status).toBe(400);
    const body = (await invalid.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.issues.map((i) => i.path).sort()).toEqual(["email", "name", "password"]);

    const malformed = await register(registerRequest("{not json"));
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: { code: string } }).error.code).toBe(
      "bad_request",
    );
  });
});

describe("authorizeCredentials", () => {
  it("accepts the right password and rejects wrong or unknown credentials the same way", async () => {
    await register(registerRequest(alex));

    const user = await authorizeCredentials({
      email: "  ALEX.wildcat@davidson.edu ",
      password: alex.password,
    });
    expect(user).toMatchObject({ email: "alex.wildcat@davidson.edu", name: "Alex Wildcat" });
    expect(user?.id).toMatch(/^[a-f0-9]{24}$/);

    expect(
      await authorizeCredentials({ email: alex.email, password: "wrong password" }),
    ).toBeNull();
    expect(
      await authorizeCredentials({ email: "nobody@davidson.edu", password: alex.password }),
    ).toBeNull();
    expect(await authorizeCredentials({ email: alex.email })).toBeNull();
    expect(await authorizeCredentials(undefined)).toBeNull();
  });
});

describe("getAuthOptions", () => {
  it("reads NEXTAUTH_SECRET lazily and configures JWT sessions with the /login page", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    try {
      const options = getAuthOptions();
      expect(options.secret).toBe("test-secret");
      expect(options.session?.strategy).toBe("jwt");
      expect(options.pages?.signIn).toBe("/login");
      expect(getAuthOptions()).toBe(options);
    } finally {
      delete process.env.NEXTAUTH_SECRET;
    }
  });
});
