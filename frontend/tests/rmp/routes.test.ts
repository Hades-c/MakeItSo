import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import * as cronRoute from "@/app/api/cron/rmp/route";
import { GET as getRatingsRoute } from "@/app/api/ratings/route";
import { RatingsResponseSchema } from "@/lib/api/ratings";
import { RosterSyncResultSchema } from "@/lib/types/ratings";
import RmpTeacher from "@/models/RmpTeacher";
import SourceSync from "@/models/SourceSync";
import type { SessionUser } from "@/server/auth/session";
import type * as CatalogModule from "@/server/catalog";
import { getCourse } from "@/server/catalog";
import { getDb } from "@/server/db";
import { ApiError, isDefinedRoute } from "@/server/http";
import { syncRoster } from "@/server/rmp";
import { RATINGS_ROUTE_RATE_LIMIT } from "@/server/rmp/course";
import { instructor, makeCourse, makeSection } from "./helpers";

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

// W1 owns getCourse (a 501 stub until it lands): by default call through; tests supply courses.
vi.mock("@/server/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof CatalogModule>();
  return { ...actual, getCourse: vi.fn(actual.getCourse) };
});

const ORIGIN = "http://localhost";
const CRON_SECRET = "test-cron-secret-0123456789";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  session.user = null;
  vi.mocked(getCourse).mockReset();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const CHE_250 = makeCourse("CHE 250", [
  makeSection({
    courseCode: "CHE 250",
    crn: "20250",
    instructors: [instructor("Christopher", "Alexander")],
  }),
  makeSection({
    courseCode: "CHE 250",
    crn: "20251",
    section: "B",
    instructors: [instructor("Christopher", "Alexander"), instructor("S", "Staff", true)],
  }),
]);

const THE_101 = makeCourse("THE 101", [
  makeSection({
    courseCode: "THE 101",
    crn: "20301",
    instructors: [instructor("Sharon", "Green"), instructor("Anita", "Tripathi")],
  }),
]);

function ratings(query: string, headers: Record<string, string> = {}) {
  return getRatingsRoute(new Request(`${ORIGIN}/api/ratings${query}`, { headers }));
}

function cron(headers: Record<string, string> = {}, method = "GET") {
  return cronRoute.GET(new Request(`${ORIGIN}/api/cron/rmp`, { method, headers }));
}

describe("GET /api/ratings", () => {
  beforeEach(async () => {
    session.user = { id: "64b000000000000000000001", email: "sam@davidson.edu", name: "Sam" };
    await syncRoster();
  });

  it("is a defineRoute handler", () => {
    expect(isDefinedRoute(getRatingsRoute)).toBe(true);
  });

  it("answers 401 with a typed error when signed out", async () => {
    session.user = null;
    const res = await ratings("?term=202602&code=CHE%20250");
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
  });

  it("validates the query (400) and normalises the course code", async () => {
    for (const query of ["", "?term=202602", "?code=CHE%20250", "?term=2026&code=CHE%20250"]) {
      const res = await ratings(query);
      expect(res.status, query).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "validation_failed",
      );
    }
    expect((await ratings("?term=202602&code=hello")).status).toBe(400);

    vi.mocked(getCourse).mockResolvedValue(CHE_250);
    expect((await ratings("?term=202602&code=che250")).status).toBe(200);
    expect(getCourse).toHaveBeenCalledWith("202602", "CHE 250");
  });

  it("rates each distinct instructor from the stored roster, never cached", async () => {
    vi.mocked(getCourse).mockResolvedValue(THE_101);
    const res = await ratings("?term=202602&code=THE%20101");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = RatingsResponseSchema.parse(await res.json());
    expect(body.enabled).toBe(true);
    expect(body.ratings.map((r) => [r.instructor.last, r.status, r.rmp?.legacyId])).toEqual([
      ["Green", "matched", 9000009],
      ["Tripathi", "matched", 9000022],
    ]);
    expect(body.ratings[0]?.rmp).toMatchObject({
      url: "https://www.ratemyprofessors.com/professor/9000009",
      asOf: "2026-09-30T16:00:00.000Z",
    });
  });

  it("answers review for a department conflict and staff for Staff, once each", async () => {
    vi.mocked(getCourse).mockResolvedValue(CHE_250);
    const body = RatingsResponseSchema.parse(
      await (await ratings("?term=202602&code=CHE%20250")).json(),
    );
    expect(body.ratings.map((r) => r.status)).toEqual(["review", "staff"]);
    expect(body.ratings.every((r) => r.rmp === undefined)).toBe(true);
  });

  it("answers 404 when the course is not offered in the term", async () => {
    vi.mocked(getCourse).mockResolvedValue(null);
    const res = await ratings("?term=202602&code=CHE%20999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "CHE 999 is not offered in Spring 2027." },
    });
  });

  it("passes the catalog's own errors through (e.g. 503 while the catalog is unavailable)", async () => {
    vi.mocked(getCourse).mockRejectedValue(
      new ApiError(503, "unavailable", "Course data is temporarily unavailable."),
    );
    const res = await ratings("?term=202602&code=CHE%20250");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: { code: "unavailable", message: "Course data is temporarily unavailable." },
    });
  });

  it("with RMP_ENABLED=false says so and rates nobody", async () => {
    vi.stubEnv("RMP_ENABLED", "false");
    vi.mocked(getCourse).mockResolvedValue(THE_101);
    const body = RatingsResponseSchema.parse(
      await (await ratings("?term=202602&code=THE%20101")).json(),
    );
    expect(body.enabled).toBe(false);
    expect(body.ratings.map((r) => r.status)).toEqual(["disabled", "disabled"]);
  });

  it("is rate-limited per user (429 + Retry-After), not per course", async () => {
    vi.mocked(getCourse).mockResolvedValue(THE_101);
    const { limit } = RATINGS_ROUTE_RATE_LIMIT;
    expect(RATINGS_ROUTE_RATE_LIMIT).toMatchObject({ name: "ratings", by: "user" });
    for (let i = 0; i < limit; i++) {
      const res = await ratings(`?term=202602&code=THE%20${i % 2 ? "101" : "102"}`);
      expect(res.status).toBe(200);
    }
    const limited = await ratings("?term=202602&code=THE%20101");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("rate_limited");

    session.user = { id: "64b000000000000000000002", email: "ana@davidson.edu", name: "Ana" };
    expect((await ratings("?term=202602&code=THE%20101")).status).toBe(200);
  });

  it("only answers GET", async () => {
    const res = await getRatingsRoute(
      new Request(`${ORIGIN}/api/ratings?term=202602&code=THE%20101`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(405);
  });
});

describe("GET /api/cron/rmp", () => {
  it("is a defineRoute handler with room for a slow roster", () => {
    expect(isDefinedRoute(cronRoute.GET)).toBe(true);
    expect(cronRoute.maxDuration).toBe(60);
  });

  it("answers 503 until CRON_SECRET is set, then needs the Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron({ authorization: `Bearer ${CRON_SECRET}` })).status).toBe(503);

    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    for (const authorization of ["", "Bearer wrong-secret-0123456789", `Basic ${CRON_SECRET}`]) {
      const res = await cron(authorization ? { authorization } : {});
      expect(res.status, authorization).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(await RmpTeacher.countDocuments()).toBe(0);
  });

  it("syncs the roster and records the source", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    const res = await cron({ authorization: `Bearer ${CRON_SECRET}` });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(RosterSyncResultSchema.parse(await res.json())).toEqual({
      ok: true,
      count: 31,
      rejectedOtherSchool: 2,
    });
    expect(await RmpTeacher.countDocuments()).toBe(31);
    expect(await SourceSync.findOne({ sourceId: "ratemyprofessors" }).lean()).toMatchObject({
      ok: true,
      lastCount: 31,
    });
  });

  it("does not call RateMyProfessors with RMP_ENABLED=false", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("RMP_ENABLED", "false");
    const res = await cron({ authorization: `Bearer ${CRON_SECRET}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, count: 0 });
    expect(await RmpTeacher.countDocuments()).toBe(0);
    expect(await SourceSync.countDocuments()).toBe(0);
  });

  it("only answers GET", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    const res = await cron({ authorization: `Bearer ${CRON_SECRET}` }, "POST");
    expect(res.status).toBe(405);
  });
});
