import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { GET, PATCH } from "@/app/api/profile/route";
import User from "@/models/User";
import type { SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";

const session = vi.hoisted(() => ({ user: null as SessionUser | null }));

vi.mock("@/server/auth/session", async () => {
  const { ApiError } = await import("@/server/http/errors");
  return {
    requireApiUser: async () => {
      if (!session.user) throw new ApiError(401, "unauthorized", "Sign in to continue.");
      return session.user;
    },
  };
});

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  session.user = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function signInAsNewUser() {
  const user = await User.create({
    name: "Sam Student",
    email: "sam@davidson.edu",
    password: "$2b$12$hash",
  });
  session.user = { id: user._id.toString(), email: user.email, name: user.name };
  return user;
}

function get() {
  return GET(new Request("http://localhost/api/profile"));
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/profile", () => {
  it("returns 401 with a typed error when signed out", async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
  });

  it("returns the profile without the password hash, never cached", async () => {
    await signInAsNewUser();
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const { user } = (await res.json()) as { user: Record<string, unknown> };
    expect(user.email).toBe("sam@davidson.edu");
    expect(user).not.toHaveProperty("password");
  });

  it("updates whitelisted fields", async () => {
    const created = await signInAsNewUser();
    const res = await patch({ major: "Computer Science", careerInterests: ["Law"] });
    expect(res.status).toBe(200);
    const stored = await User.findById(created._id).lean();
    expect(stored?.major).toBe("Computer Science");
    expect(stored?.careerInterests).toEqual(["Law"]);
  });

  it("rejects fields outside the whitelist (no mass assignment)", async () => {
    const created = await signInAsNewUser();
    for (const body of [
      { email: "attacker@example.com" },
      { password: "x" },
      { totalCreditsRequired: 1 },
      JSON.parse('{"__proto__": {"polluted": true}}'),
    ]) {
      const res = await patch(body);
      expect(res.status).toBe(400);
    }
    const stored = await User.findById(created._id).select("+password").lean();
    expect(stored?.email).toBe("sam@davidson.edu");
    expect(stored?.password).toBe("$2b$12$hash");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses a cross-site PATCH", async () => {
    await signInAsNewUser();
    const res = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ major: "Hacked" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
