import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import type { SyncedSourceId } from "@/lib/sources";
import { FEED_SOURCE_IDS, FeedItemSchema, type FeedSourceId } from "@/lib/types/feeds";
import FeedItem from "@/models/FeedItem";
import SourceSync from "@/models/SourceSync";
import { getDb } from "@/server/db";
import { syncFeeds } from "@/server/feeds";
import { FEED_ITEM_TTL_DAYS, toFeedItem } from "@/server/feeds/store";
import { dedupeAcrossChannels } from "@/server/feeds/sync";
import type { NormalizedFeedItem } from "@/server/feeds/types";
import { safeItemUrl } from "@/server/feeds/urls";
import type * as External from "@/server/http/external";
import { ExternalFetchError, fetchExternal } from "@/server/http/external";
import { MissingFixtureError } from "@/server/http/fixtures";
import { getSourceStatuses } from "@/server/sync";
import { fixture, FIXTURE_NOW } from "./helpers";

vi.mock("@/server/http/external", async (importOriginal) => {
  const actual = await importOriginal<typeof External>();
  return { ...actual, fetchExternal: vi.fn(actual.fetchExternal) };
});

const WILDCAT_ICS = "https://wildcatsync.davidson.edu/events.ics";
const WILDCAT_RSS = "https://wildcatsync.davidson.edu/news.rss";
const HURT_ICS = "https://hurthub.davidson.edu/events/?ical=1";
const TRIBE = "https://hurthub.davidson.edu/wp-json/tribe/events/v1/events";

type Fetch = (source: SyncedSourceId, url: string, options?: unknown) => Promise<unknown>;
let realFetch: Fetch;
const fetchMock = vi.mocked(fetchExternal);

/** Route some upstream URLs to a failure or a replacement body; everything else is served from fixtures. */
function upstream(
  overrides: Array<[match: (url: string) => boolean, reply: "fail" | "missing" | string]>,
) {
  const impl: Fetch = async (source, url, options) => {
    for (const [match, reply] of overrides) {
      if (!match(url)) continue;
      if (reply === "fail")
        throw new ExternalFetchError(source, url, "http", "Upstream answered 503", 503);
      if (reply === "missing") throw new MissingFixtureError(source, "GET", url);
      return {
        sourceId: source,
        url,
        status: 200,
        headers: new Headers(),
        data: reply,
        fetchedAt: new Date(),
        fromFixture: true,
      };
    }
    return realFetch(source, url, options);
  };
  fetchMock.mockImplementation(impl as unknown as typeof fetchExternal);
}

const is = (target: string) => (url: string) => url === target;
const startsWith = (prefix: string) => (url: string) => url.startsWith(prefix);

let testDb: TestDb;

beforeAll(async () => {
  realFetch = (await vi.importActual<typeof External>("@/server/http/external"))
    .fetchExternal as unknown as Fetch;
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => {
  // Back to the real (fixtures) implementation, with no recorded calls.
  fetchMock.mockReset();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function countBy(source: FeedSourceId, extra: Record<string, unknown> = {}) {
  return FeedItem.countDocuments({ source, ...extra });
}

const EXPECTED_COUNTS: Record<FeedSourceId, number> = {
  wildcatsync: 29, // 15 events (incl. 1 deadline) + 14 news (1 stale 2024 post skipped)
  "hurt-hub": 9,
  library: 21, // 11 locations' hours + 10 upcoming events
  davidsonian: 10,
  "events-digest": 18,
  "davidson-news": 8, // 2 stale sticky stories skipped
};

describe("syncFeeds (fixtures)", () => {
  it("syncs every feed source, records each with recordSync and stores valid items", async () => {
    const results = await syncFeeds();
    expect(results.map((r) => r.source)).toEqual([...FEED_SOURCE_IDS]);
    for (const result of results) {
      expect(result).toEqual({
        source: result.source,
        ok: true,
        count: EXPECTED_COUNTS[result.source as FeedSourceId],
      });
    }
    const statuses = await getSourceStatuses(FIXTURE_NOW);
    expect(statuses.map((s) => [s.id, s.status, s.count])).toEqual(
      FEED_SOURCE_IDS.map((id) => [id, "ok", EXPECTED_COUNTS[id]]),
    );
    expect(statuses.every((s) => s.lastSync?.getTime() === FIXTURE_NOW.getTime())).toBe(true);

    const docs = await FeedItem.find({}).lean();
    expect(docs).toHaveLength(Object.values(EXPECTED_COUNTS).reduce((a, b) => a + b, 0));
    for (const doc of docs) {
      // The tag always comes from the stored source; every link is https on that source's allow-list.
      expect(safeItemUrl(doc.source, doc.url)).toBe(doc.url);
      expect(FeedItemSchema.safeParse(toFeedItem(doc)).success).toBe(true);
      const anchor = doc.endsAt ?? doc.startsAt ?? doc.fetchedAt;
      expect(doc.expiresAt!.getTime() - anchor.getTime()).toBe(FEED_ITEM_TTL_DAYS * 86_400_000);
      expect(doc.fetchedAt.getTime()).toBe(FIXTURE_NOW.getTime());
      expect(doc.searchText).toBe(doc.searchText.toLowerCase());
    }
    expect(await countBy("wildcatsync", { kind: "deadline" })).toBe(1);
    expect(await countBy("library", { kind: "hours" })).toBe(11);
  });

  it("is idempotent: a second run updates in place (no duplicates) and bumps fetchedAt", async () => {
    await syncFeeds();
    const before = await FeedItem.countDocuments();
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T12:45:00-04:00");
    const results = await syncFeeds();
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await FeedItem.countDocuments()).toBe(before);
    const doc = await FeedItem.findOne({ source: "davidsonian" }).lean();
    expect(doc!.fetchedAt.toISOString()).toBe("2026-09-30T16:45:00.000Z");
  });

  it("a failing source keeps its last good items and is recorded as failing", async () => {
    await syncFeeds();
    upstream([[startsWith("https://wildcatsync.davidson.edu/"), "fail"]]);
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T13:00:00-04:00");
    const [result] = await syncFeeds({ sources: ["wildcatsync"] });
    expect(result).toEqual({
      source: "wildcatsync",
      ok: false,
      count: 0,
      error: "events: HTTP 503 (http); news: HTTP 503 (http)",
    });
    expect(await countBy("wildcatsync")).toBe(29);
    const sync = await SourceSync.findOne({ sourceId: "wildcatsync" }).lean();
    expect(sync).toMatchObject({ ok: false, consecutiveFailures: 1, lastCount: 29 });
    expect(sync!.lastSuccessAt!.getTime()).toBe(FIXTURE_NOW.getTime());
    const status = (await getSourceStatuses(FIXTURE_NOW)).find((s) => s.id === "wildcatsync")!;
    expect(status).toMatchObject({ status: "error", error: expect.stringContaining("HTTP 503") });
    // Other sources are unaffected.
    expect((await syncFeeds({ sources: ["davidsonian"] }))[0]!.ok).toBe(true);
  });

  it("one failing channel keeps its items while the source's other channel updates", async () => {
    await syncFeeds({ sources: ["wildcatsync"] });
    upstream([[is(WILDCAT_ICS), "fail"]]);
    const [result] = await syncFeeds({ sources: ["wildcatsync"] });
    expect(result).toEqual({
      source: "wildcatsync",
      ok: false,
      count: 14,
      error: "events: HTTP 503 (http)",
    });
    expect(await countBy("wildcatsync", { channel: "events" })).toBe(15);
    expect(await countBy("wildcatsync", { channel: "news" })).toBe(14);
  });

  it("an HTML error page instead of iCal (or a truncated file) is a parse failure that changes nothing", async () => {
    await syncFeeds({ sources: ["wildcatsync"] });
    upstream([
      [is(WILDCAT_ICS), "<!doctype html><title>Service unavailable</title>"],
      [is(WILDCAT_RSS), '<rss version="2.0"><channel><item><title>cut'],
    ]);
    const [result] = await syncFeeds({ sources: ["wildcatsync"] });
    expect(result!.ok).toBe(false);
    expect(result!.error).toMatch(/^events: parse: Not an iCalendar document.*; news: parse: /);
    expect(await countBy("wildcatsync")).toBe(29);
  });

  it("prunes an upcoming event that vanished upstream, but never past items", async () => {
    await syncFeeds({ sources: ["wildcatsync"] });
    await FeedItem.create({
      source: "wildcatsync",
      externalId: "https://wildcatsync.davidson.edu/event/1",
      channel: "events",
      kind: "event",
      title: "Yesterday's event",
      url: "https://wildcatsync.davidson.edu/event/1",
      startsAt: new Date("2026-09-29T18:00:00Z"),
      endsAt: new Date("2026-09-29T19:00:00Z"),
      fetchedAt: new Date("2026-09-29T12:00:00Z"),
    });
    const withoutDrive = fixture("wildcatsync/events.ics").replace(
      /BEGIN:VEVENT\r\n(?:(?!END:VEVENT)[\s\S])*?event\/12784886\r\n(?:(?!END:VEVENT)[\s\S])*?END:VEVENT\r\n/,
      "",
    );
    expect(withoutDrive).not.toContain("event/12784886");
    upstream([[is(WILDCAT_ICS), withoutDrive]]);
    const [result] = await syncFeeds({ sources: ["wildcatsync"] });
    expect(result).toMatchObject({ ok: true, count: 28 });
    expect(
      await countBy("wildcatsync", {
        externalId: "https://wildcatsync.davidson.edu/event/12784886",
      }),
    ).toBe(0);
    expect(
      await countBy("wildcatsync", { externalId: "https://wildcatsync.davidson.edu/event/1" }),
    ).toBe(1);
    expect(await countBy("wildcatsync", { channel: "news" })).toBe(14);
  });

  it("a much smaller (or empty) upstream answer prunes nothing", async () => {
    await syncFeeds({ sources: ["wildcatsync"] });
    const oneEvent = fixture("wildcatsync/events.ics").replace(
      /(END:VEVENT\r\n)[\s\S]*(END:VCALENDAR)/,
      "$1$2",
    );
    upstream([[is(WILDCAT_ICS), oneEvent]]);
    expect((await syncFeeds({ sources: ["wildcatsync"] }))[0]).toMatchObject({
      ok: true,
      count: 15,
    });
    expect(await countBy("wildcatsync", { channel: "events" })).toBe(15);

    upstream([[is(WILDCAT_ICS), "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"]]);
    expect((await syncFeeds({ sources: ["wildcatsync"] }))[0]).toMatchObject({
      ok: true,
      count: 14,
    });
    expect(await countBy("wildcatsync", { channel: "events" })).toBe(15);
  });

  it("Hurt Hub falls back to the Tribe API when the iCal export fails, without duplicates", async () => {
    await syncFeeds({ sources: ["hurt-hub"] });
    const ids = (await FeedItem.find({ source: "hurt-hub" }).lean())
      .map((d) => d.externalId)
      .sort();
    upstream([[is(HURT_ICS), "fail"]]);
    const [result] = await syncFeeds({ sources: ["hurt-hub"] });
    expect(result).toEqual({ source: "hurt-hub", ok: true, count: 9 });
    const after = await FeedItem.find({ source: "hurt-hub" }).lean();
    expect(after.map((d) => d.externalId).sort()).toEqual(ids);
    expect(after.find((d) => d.externalId === "hurt-hub:1862")!.title).toBe(
      "Building a Lean Startup – Fall 2026",
    );
    expect(
      fetchMock.mock.calls.some(([, url]) =>
        url.startsWith(`${TRIBE}?per_page=50&start_date=2026-09-30`),
      ),
    ).toBe(true);
  });

  it("both Hurt Hub paths failing is one failure that names both and keeps the items", async () => {
    await syncFeeds({ sources: ["hurt-hub"] });
    upstream([
      [is(HURT_ICS), "fail"],
      [startsWith(TRIBE), "fail"],
    ]);
    const [result] = await syncFeeds({ sources: ["hurt-hub"] });
    expect(result).toEqual({
      source: "hurt-hub",
      ok: false,
      count: 0,
      error: "events: iCal HTTP 503 (http); Tribe API HTTP 503 (http)",
    });
    expect(await countBy("hurt-hub")).toBe(9);
  });

  it("never swallows MissingFixtureError", async () => {
    upstream([[is(WILDCAT_RSS), "missing"]]);
    await expect(syncFeeds({ sources: ["wildcatsync"] })).rejects.toBeInstanceOf(
      MissingFixtureError,
    );
    upstream([[is(HURT_ICS), "missing"]]);
    await expect(syncFeeds({ sources: ["hurt-hub"] })).rejects.toBeInstanceOf(MissingFixtureError);
  });

  it("a storage failure is recorded as a failed sync", async () => {
    const spy = vi.spyOn(FeedItem, "bulkWrite").mockRejectedValueOnce(new Error("disk full"));
    const [result] = await syncFeeds({ sources: ["davidsonian"] });
    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({
      source: "davidsonian",
      ok: false,
      count: 0,
      error: "unexpected error",
    });
    expect(await SourceSync.findOne({ sourceId: "davidsonian" }).lean()).toMatchObject({
      ok: false,
    });
  });

  it("concurrent syncs of one source share a single run", async () => {
    const [a, b] = await Promise.all([
      syncFeeds({ sources: ["davidsonian"] }),
      syncFeeds({ sources: ["davidsonian"] }),
    ]);
    expect(a).toEqual(b);
    const calls = fetchMock.mock.calls.filter(
      ([, url]) => url === "https://thedavidsonian.news/feed/",
    );
    expect(calls).toHaveLength(1);
  });

  it("onlyStale skips sources inside their 30/60-minute freshness window", async () => {
    await syncFeeds();
    expect(await syncFeeds({ onlyStale: true })).toEqual([]);
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T12:31:00-04:00");
    expect((await syncFeeds({ onlyStale: true })).map((r) => r.source)).toEqual([
      "wildcatsync",
      "library",
    ]);
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T12:59:00-04:00");
    expect(await syncFeeds({ onlyStale: true })).toEqual([]);
    // 60.5 minutes after the full sync, 29.5 after WildcatSync and the library.
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T13:00:30-04:00");
    expect((await syncFeeds({ onlyStale: true })).map((r) => r.source)).toEqual([
      "hurt-hub",
      "davidsonian",
      "events-digest",
      "davidson-news",
    ]);
  });

  it("rejects unknown sources", async () => {
    await expect(syncFeeds({ sources: ["handshake" as FeedSourceId] })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
  });
});

describe("dedupeAcrossChannels (WildcatSync events.ics + RSS)", () => {
  const item = (channel: string, externalId: string, url: string): NormalizedFeedItem => ({
    source: "wildcatsync",
    channel,
    externalId,
    kind: channel === "news" ? "news" : "event",
    title: externalId,
    url,
    startsAt: new Date("2026-10-01T14:00:00Z"),
    endsAt: null,
    allDay: false,
    location: null,
    summaryText: null,
  });

  it("drops later-channel items with the same UID or the same link; keeps same-channel shared links", () => {
    const events = {
      channel: {
        channel: "events",
        format: "ics" as const,
        url: "https://wildcatsync.davidson.edu/events.ics",
      },
      scope: { kind: "none" as const },
      items: [
        item("events", "uid-1", "https://wildcatsync.davidson.edu/event/1"),
        item("events", "uid-2", "https://wildcatsync.davidson.edu/event/2"),
        item("events", "uid-3", "https://wildcatsync.davidson.edu/event/2"),
      ],
    };
    const news = {
      channel: {
        channel: "news",
        format: "rss-news" as const,
        url: "https://wildcatsync.davidson.edu/news.rss",
      },
      scope: { kind: "none" as const },
      items: [
        item("news", "uid-1", "https://wildcatsync.davidson.edu/news/9"),
        item("news", "guid-2", "https://wildcatsync.davidson.edu/event/1/?utm_source=rss"),
        item("news", "guid-3", "https://wildcatsync.davidson.edu/news/3"),
      ],
    };
    dedupeAcrossChannels([events, news]);
    expect(events.items.map((i) => i.externalId)).toEqual(["uid-1", "uid-2", "uid-3"]);
    expect(news.items.map((i) => i.externalId)).toEqual(["guid-3"]);
  });
});
