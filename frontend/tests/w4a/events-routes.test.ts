import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { GET as cronGet } from "@/app/api/cron/feeds/route";
import { GET as hoursGet } from "@/app/api/events/library-hours/route";
import { GET as eventsGet } from "@/app/api/events/route";
import { CronResponseSchema, EventsResponseSchema } from "@/lib/api/events";
import { FEED_SOURCE_IDS, LibraryHoursSchema } from "@/lib/types/feeds";
import type { SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { syncFeeds } from "@/server/feeds";
import { isDefinedRoute } from "@/server/http";
import type * as External from "@/server/http/external";
import { ExternalFetchError, fetchExternal } from "@/server/http/external";
import type { SyncedSourceId } from "@/lib/sources";

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

vi.mock("@/server/http/external", async (importOriginal) => {
  const actual = await importOriginal<typeof External>();
  return { ...actual, fetchExternal: vi.fn(actual.fetchExternal) };
});
const fetchMock = vi.mocked(fetchExternal);

const SAM: SessionUser = { id: "0123456789abcdef01234567", email: "sam@davidson.edu", name: "Sam" };
const SECRET = "cron-secret-for-tests-0123456789";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  session.user = null;
  fetchMock.mockReset();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

function get(handler: typeof eventsGet, path: string, headers: Record<string, string> = {}) {
  return handler(new Request(`http://localhost${path}`, { headers }));
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/events", () => {
  it("is a defineRoute handler that needs a signed-in user", async () => {
    expect(isDefinedRoute(eventsGet)).toBe(true);
    const res = await get(eventsGet, "/api/events");
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
  });

  it("lists the synced items with each feed source's last sync, never cached", async () => {
    session.user = SAM;
    const empty = EventsResponseSchema.parse(await json(await get(eventsGet, "/api/events")));
    expect(empty.items).toEqual([]);
    expect(empty.sources).toEqual(FEED_SOURCE_IDS.map((id) => ({ id, lastSync: null })));

    await syncFeeds();
    const res = await get(eventsGet, "/api/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = EventsResponseSchema.parse(await res.json());
    expect(body.items.length).toBeGreaterThan(20);
    expect(body.hasMore).toBe(false);
    expect(body.sources).toEqual(
      FEED_SOURCE_IDS.map((id) => ({ id, lastSync: "2026-09-30T16:00:00.000Z" })),
    );
  });

  it("says when more items match than the limit returned", async () => {
    session.user = SAM;
    await syncFeeds();
    const all = EventsResponseSchema.parse(await json(await get(eventsGet, "/api/events")));
    expect(all.items.length).toBeGreaterThan(3);
    const cut = EventsResponseSchema.parse(await json(await get(eventsGet, "/api/events?limit=3")));
    expect(cut.items).toHaveLength(3);
    expect(cut.hasMore).toBe(true);
    const exact = EventsResponseSchema.parse(
      await json(await get(eventsGet, `/api/events?limit=${all.items.length}`)),
    );
    expect(exact.hasMore).toBe(false);
  });

  it("applies the query filters (repeated or comma-separated lists, q, limit, window)", async () => {
    session.user = SAM;
    await syncFeeds({ sources: ["wildcatsync", "hurt-hub"] });
    const hub = EventsResponseSchema.parse(
      await json(await get(eventsGet, "/api/events?sources=hurt-hub")),
    );
    expect(hub.items.every((i) => i.source === "hurt-hub")).toBe(true);
    expect(hub.sources.map((s) => s.id)).toEqual(["hurt-hub"]);
    const both = EventsResponseSchema.parse(
      await json(await get(eventsGet, "/api/events?sources=library&sources=hurt-hub&kinds=event")),
    );
    expect(both.sources).toEqual([
      { id: "hurt-hub", lastSync: "2026-09-30T16:00:00.000Z" },
      { id: "library", lastSync: null },
    ]);
    const deadlines = EventsResponseSchema.parse(
      await json(await get(eventsGet, "/api/events?kinds=deadline")),
    );
    expect(deadlines.items.map((i) => i.kind)).toEqual(["deadline"]);
    const voter = EventsResponseSchema.parse(
      await json(await get(eventsGet, "/api/events?q=voter&limit=1")),
    );
    expect(voter.items.map((i) => i.title)).toEqual(["Voter Registration Drive"]);
    const window = EventsResponseSchema.parse(
      await json(
        await get(
          eventsGet,
          `/api/events?from=${encodeURIComponent("2026-10-01T00:00:00-04:00")}&to=${encodeURIComponent("2026-10-02T00:00:00-04:00")}`,
        ),
      ),
    );
    expect(window.items.length).toBeGreaterThan(0);
    expect(
      window.items.every((i) => Date.parse(i.startsAt!) < Date.parse("2026-10-02T04:00:00Z")),
    ).toBe(true);
  });

  it.each([
    ["kinds=party"],
    ["sources=handshake"],
    ["limit=501"],
    ["limit=0"],
    ["from=yesterday"],
    [
      `from=${encodeURIComponent("2026-10-02T00:00:00Z")}&to=${encodeURIComponent("2026-10-01T00:00:00Z")}`,
    ],
  ])("rejects ?%s with 400 validation_failed", async (query) => {
    session.user = SAM;
    const res = await get(eventsGet, `/api/events?${query}`);
    expect(res.status).toBe(400);
    expect(((await json(res)).error as { code: string }).code).toBe("validation_failed");
  });

  it("is 404 while FEATURE_EVENTS is off", async () => {
    session.user = SAM;
    vi.stubEnv("FEATURE_EVENTS", "false");
    const res = await get(eventsGet, "/api/events");
    expect(res.status).toBe(404);
    expect(((await json(res)).error as { code: string }).code).toBe("not_found");
    expect((await get(hoursGet, "/api/events/library-hours")).status).toBe(404);
  });
});

describe("GET /api/events/library-hours", () => {
  it("needs a signed-in user", async () => {
    expect((await get(hoursGet, "/api/events/library-hours")).status).toBe(401);
  });

  it("defaults to today (America/New_York) and accepts ?date=", async () => {
    session.user = SAM;
    const res = await get(hoursGet, "/api/events/library-hours");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const { hours } = (await res.json()) as { hours: unknown };
    const parsed = LibraryHoursSchema.parse(hours);
    expect(parsed.date).toBe("2026-09-30");
    expect(parsed.locations).toHaveLength(11);
    const same = await json(await get(hoursGet, "/api/events/library-hours?date=2026-09-30"));
    expect(same).toEqual({ hours });
  });

  it("404 for a date without hours, 400 for a malformed date, 503 when LibCal is down", async () => {
    session.user = SAM;
    expect((await get(hoursGet, "/api/events/library-hours?date=2026-10-15")).status).toBe(404);
    expect((await get(hoursGet, "/api/events/library-hours?date=tomorrow")).status).toBe(400);
    fetchMock.mockImplementation((async (source: SyncedSourceId, url: string) => {
      throw new ExternalFetchError(source, url, "network", "Request failed");
    }) as unknown as typeof fetchExternal);
    const down = await get(hoursGet, "/api/events/library-hours");
    expect(down.status).toBe(503);
    expect(((await json(down)).error as { code: string }).code).toBe("unavailable");
  });
});

describe("GET /api/cron/feeds", () => {
  it("answers 503 while CRON_SECRET is unset and 401 without the right bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await get(cronGet, "/api/cron/feeds")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await get(cronGet, "/api/cron/feeds")).status).toBe(401);
    expect(
      (await get(cronGet, "/api/cron/feeds", { authorization: "Bearer wrong-secret-0000000" }))
        .status,
    ).toBe(401);
    // A signed-in user is not a cron caller.
    session.user = SAM;
    expect((await get(cronGet, "/api/cron/feeds")).status).toBe(401);
  });

  it("syncs every feed and reports one result per source", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await get(cronGet, "/api/cron/feeds", { authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = CronResponseSchema.parse(await res.json());
    expect(body.ok).toBe(true);
    expect(body.results.map((r) => r.source)).toEqual([...FEED_SOURCE_IDS]);
    expect(body.results.every((r) => r.ok && r.count > 0)).toBe(true);
  });

  it("reports ok:false (still 200) when a source fails, and nothing while events are off", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const real = (await vi.importActual<typeof External>("@/server/http/external")).fetchExternal;
    fetchMock.mockImplementation((async (source: SyncedSourceId, url: string, options: never) => {
      if (source === "davidsonian")
        throw new ExternalFetchError(source, url, "http", "Upstream answered 500", 500);
      return real(source, url, options);
    }) as unknown as typeof fetchExternal);
    const body = CronResponseSchema.parse(
      await json(await get(cronGet, "/api/cron/feeds", { authorization: `Bearer ${SECRET}` })),
    );
    expect(body.ok).toBe(false);
    expect(body.results.find((r) => r.source === "davidsonian")).toEqual({
      source: "davidsonian",
      ok: false,
      count: 0,
      error: "news: HTTP 500 (http)",
    });

    vi.stubEnv("FEATURE_EVENTS", "false");
    const off = await json(
      await get(cronGet, "/api/cron/feeds", { authorization: `Bearer ${SECRET}` }),
    );
    expect(off).toEqual({ ok: true, results: [] });
  });

  it("only answers GET", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await cronGet(
      new Request("http://localhost/api/cron/feeds", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(405);
  });
});
