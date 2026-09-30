import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { startTestDb, type TestDb } from "../../helpers/db";
import User from "@/models/User";
import type { SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { ApiError, defineRoute, PUBLIC_CATALOG_CACHE } from "@/server/http";

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
  resetEnvCache();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const ORIGIN = "http://localhost";

function post(
  body: unknown,
  headers: Record<string, string> = {},
  url = `${ORIGIN}/api/thing`,
  method = "POST",
) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string; issues?: unknown } })
    .error;
}

async function signIn(fields: Record<string, unknown> = {}) {
  const email = (fields.email as string | undefined) ?? "sam@davidson.edu";
  const created = await User.create({ name: "Sam", email, password: "$2b$12$hash" });
  // emailVerifiedAt is added to the schema by W3: write it the way W3 will store it (a Date field).
  if (fields.emailVerifiedAt) {
    await User.collection.updateOne(
      { _id: created._id },
      { $set: { emailVerifiedAt: fields.emailVerifiedAt } },
    );
  }
  session.user = { id: created._id.toString(), email, name: "Sam" };
  return session.user;
}

const Body = z.object({ code: z.string() }).strict();

describe("defineRoute: responses", () => {
  it("sends handler values as JSON with the configured status and no-store", async () => {
    const handler = defineRoute(
      { method: "POST", auth: "public", body: Body, status: 201 },
      async ({ body }) => ({ echoed: body.code }),
    );
    const res = await handler(post({ code: "CSC 121" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ echoed: "CSC 121" });
  });

  it("answers 204 for null and passes Response objects through", async () => {
    const empty = defineRoute({ method: "DELETE", auth: "public", response: null }, () => null);
    const res = await empty(
      new Request(`${ORIGIN}/x`, { method: "DELETE", headers: { origin: ORIGIN } }),
    );
    expect(res.status).toBe(204);

    const raw = defineRoute({ method: "GET", auth: "public" }, () => new Response("hi"));
    const text = await raw(new Request(`${ORIGIN}/x`));
    expect(await text.text()).toBe("hi");
    expect(text.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks public catalog responses cacheable at the CDN, and never errors", async () => {
    const catalog = defineRoute(
      {
        method: "GET",
        auth: "public",
        cache: "public-catalog",
        query: z.object({ fail: z.string().optional() }),
      },
      ({ query }) => {
        if (query.fail) throw new ApiError(404, "not_found", "No such course");
        return { ok: true };
      },
    );
    const ok = await catalog(new Request(`${ORIGIN}/api/catalog/x`));
    expect(ok.headers.get("cache-control")).toBe(PUBLIC_CATALOG_CACHE);
    expect(PUBLIC_CATALOG_CACHE).toBe("public, s-maxage=900, stale-while-revalidate=3600");
    const missing = await catalog(new Request(`${ORIGIN}/api/catalog/x?fail=1`));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses to define a cookie-reading or non-GET public-catalog route", () => {
    expect(() =>
      defineRoute({ method: "GET", auth: "user", cache: "public-catalog" }, () => null),
    ).toThrow(/public-catalog/);
    expect(() =>
      defineRoute({ method: "POST", auth: "public", cache: "public-catalog" }, () => null),
    ).toThrow(/public-catalog/);
    expect(() => defineRoute({ method: "GET", auth: "public", body: Body }, () => null)).toThrow(
      /GET routes cannot take a body/,
    );
  });

  it("checks the response against its contract outside production", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const drift = defineRoute(
      { method: "GET", auth: "public", response: z.object({ n: z.number() }) },
      () => ({ n: "not a number" }) as unknown as { n: number },
    );
    const res = await drift(new Request(`${ORIGIN}/x`));
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalled();
  });

  it("maps CastError to 400 and E11000 to 409", async () => {
    const byId = defineRoute({ method: "GET", auth: "public" }, async () => {
      await User.findById("not-an-id");
      return {};
    });
    const cast = await byId(new Request(`${ORIGIN}/x`));
    expect(cast.status).toBe(400);
    expect((await errorOf(cast)).code).toBe("bad_request");

    const duplicate = defineRoute({ method: "GET", auth: "public" }, async () => {
      await User.create({ name: "A", email: "dup@davidson.edu" });
      await User.create({ name: "B", email: "dup@davidson.edu" });
      return {};
    });
    await User.init();
    const conflict = await duplicate(new Request(`${ORIGIN}/x`));
    expect(conflict.status).toBe(409);
    expect((await errorOf(conflict)).code).toBe("conflict");
  });

  it("re-throws Next.js control flow (notFound) untouched", async () => {
    const handler = defineRoute({ method: "GET", auth: "public" }, () => notFound());
    await expect(handler(new Request(`${ORIGIN}/x`))).rejects.toThrow();
  });

  it("answers 405 for the wrong method but serves HEAD from GET", async () => {
    const handler = defineRoute({ method: "GET", auth: "public" }, () => ({ ok: true }));
    const wrong = await handler(post({}));
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET");
    expect((await handler(new Request(`${ORIGIN}/x`, { method: "HEAD" }))).status).toBe(200);
  });
});

describe("defineRoute: request validation", () => {
  const handler = defineRoute(
    { method: "POST", auth: "public", body: Body, maxBytes: 64 },
    ({ body }) => body,
  );

  it("requires application/json (415)", async () => {
    const res = await handler(post({ code: "x" }, { "content-type": "text/plain" }));
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe("bad_request");
    const charset = await handler(
      post({ code: "x" }, { "content-type": "application/json; charset=utf-8" }),
    );
    expect(charset.status).toBe(200);
  });

  it("caps the body size (413), by header and by stream", async () => {
    const big = JSON.stringify({ code: "x".repeat(200) });
    expect((await handler(post(big))).status).toBe(413);
    const streamed = new Request(`${ORIGIN}/x`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(big));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await handler(streamed)).status).toBe(413);
  });

  it("rejects malformed JSON (400 bad_request) and unknown keys (400 validation_failed)", async () => {
    const malformed = await handler(post("{nope"));
    expect(malformed.status).toBe(400);
    expect(await errorOf(malformed)).toEqual({
      code: "bad_request",
      message: "Request body must be valid JSON.",
    });
    const extra = await handler(post({ code: "x", isAdmin: true }));
    expect(extra.status).toBe(400);
    expect((await errorOf(extra)).code).toBe("validation_failed");
  });

  it("parses query strings (repeated keys → arrays) and awaited params", async () => {
    const route = defineRoute(
      {
        method: "GET",
        auth: "public",
        query: z.object({ dept: z.array(z.string()).or(z.string()), n: z.coerce.number() }),
        params: z.object({ id: z.string().regex(/^\d+$/) }),
      },
      ({ query, params }) => ({ query, params }),
    );
    const res = await route(new Request(`${ORIGIN}/x/7?dept=CSC&dept=MAT&n=3`), {
      params: Promise.resolve({ id: "7" }),
    });
    expect(await res.json()).toEqual({
      query: { dept: ["CSC", "MAT"], n: 3 },
      params: { id: "7" },
    });
    const bad = await route(new Request(`${ORIGIN}/x/a?n=1&dept=A`), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(bad.status).toBe(400);
  });
});

describe("defineRoute: cross-site protection (non-GET)", () => {
  const handler = defineRoute({ method: "POST", auth: "public", body: Body }, () => ({ ok: true }));

  it("accepts the request's own origin in tests and Sec-Fetch-Site same-origin", async () => {
    expect((await handler(post({ code: "x" }))).status).toBe(200);
    const noOrigin = new Request(`${ORIGIN}/x`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ code: "x" }),
    });
    expect((await handler(noOrigin)).status).toBe(200);
  });

  it("rejects other origins, the null origin, and requests with neither header", async () => {
    for (const origin of ["https://evil.example", "null", "http://localhost:3999"]) {
      const res = await handler(post({ code: "x" }, { origin }));
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe("forbidden");
    }
    const bare = new Request(`${ORIGIN}/x`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ code: "x" }),
    });
    expect((await handler(bare)).status).toBe(403);
  });

  it("uses APP_ORIGIN, else the NEXTAUTH_URL origin, and in production nothing else", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://make-it-so.vercel.app");
    const url = "https://make-it-so.vercel.app/api/thing";
    expect(
      (await handler(post({ code: "x" }, { origin: "https://make-it-so.vercel.app" }, url))).status,
    ).toBe(200);
    expect((await handler(post({ code: "x" }, { origin: ORIGIN }))).status).toBe(403);

    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXTAUTH_URL", "https://preview.example.dev/app");
    vi.stubEnv("VERCEL_BRANCH_URL", "make-it-so-git-branch.vercel.app");
    expect(
      (await handler(post({ code: "x" }, { origin: "https://preview.example.dev" }))).status,
    ).toBe(200);
    expect(
      (await handler(post({ code: "x" }, { origin: "https://make-it-so-git-branch.vercel.app" })))
        .status,
    ).toBe(200);
  });

  it("fails with a 500 (not a pass) when production has no APP_ORIGIN", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "");
    const res = await handler(post({ code: "x" }));
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalled();
  });

  it("does not apply to GET, nor to cron routes (bearer auth)", async () => {
    const get = defineRoute({ method: "GET", auth: "public" }, () => ({ ok: true }));
    expect(
      (await get(new Request(`${ORIGIN}/x`, { headers: { origin: "https://evil.example" } })))
        .status,
    ).toBe(200);
  });
});

describe("defineRoute: auth modes", () => {
  const user = defineRoute({ method: "GET", auth: "user" }, ({ user }) => ({ id: user.id }));
  const verified = defineRoute({ method: "GET", auth: "verified" }, ({ user }) => ({
    id: user.id,
  }));
  const admin = defineRoute({ method: "GET", auth: "admin" }, ({ user }) => ({ id: user.id }));
  const get = (h: typeof user) => h(new Request(`${ORIGIN}/x`));

  it("user: 401 signed out, the session user signed in", async () => {
    expect((await get(user)).status).toBe(401);
    const me = await signIn();
    expect(await (await get(user)).json()).toEqual({ id: me.id });
  });

  it("verified: needs a verified mailbox AND an @davidson.edu address", async () => {
    await signIn();
    const unverified = await get(verified);
    expect(unverified.status).toBe(403);
    expect((await errorOf(unverified)).message).toMatch(/verified @davidson\.edu accounts/);

    await testDb.clear();
    await signIn({ email: "legacy@gmail.com", emailVerifiedAt: new Date() });
    expect((await get(verified)).status).toBe(403);

    await testDb.clear();
    const ok = await signIn({ emailVerifiedAt: new Date("2026-09-30T12:00:00Z") });
    expect(await (await get(verified)).json()).toEqual({ id: ok.id });
  });

  it("admin: e-mail in ADMIN_EMAILS with a verified mailbox", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@davidson.edu");
    await signIn({ email: "owner@davidson.edu" });
    expect((await get(admin)).status).toBe(403);
    await testDb.clear();
    await signIn({ email: "sam@davidson.edu", emailVerifiedAt: new Date() });
    expect((await get(admin)).status).toBe(403);
    await testDb.clear();
    await signIn({ email: "owner@davidson.edu", emailVerifiedAt: new Date() });
    expect((await get(admin)).status).toBe(200);
  });

  it("cron: 503 until CRON_SECRET is set, then Bearer only (constant-time compare)", async () => {
    const cron = defineRoute({ method: "POST", auth: "cron" }, ({ user }) => ({ user }));
    const call = (authorization?: string) =>
      cron(
        new Request(`${ORIGIN}/api/cron/x`, {
          method: "POST",
          headers: authorization ? { authorization } : {},
        }),
      );
    expect((await call("Bearer anything")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "s3cret-s3cret-s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("Basic s3cret-s3cret-s3cret")).status).toBe(401);
    const ok = await call("Bearer s3cret-s3cret-s3cret");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ user: null });
  });
});

describe("defineRoute: rate limits", () => {
  it("answers 429 with Retry-After once a user is over the limit", async () => {
    const limited = defineRoute(
      {
        method: "GET",
        auth: "user",
        rateLimit: { name: "test-export", limit: 2, windowSec: 3600, by: "user" },
      },
      () => ({ ok: true }),
    );
    await signIn();
    const call = () => limited(new Request(`${ORIGIN}/x`));
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const third = await call();
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await errorOf(third)).code).toBe("rate_limited");
    expect(await mongoose.connection.db!.collection("ratelimits").countDocuments()).toBe(1);
  });
});
