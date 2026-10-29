import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { FeedItemSchema } from "@/lib/types/feeds";
import FeedItem from "@/models/FeedItem";
import { getDb } from "@/server/db";
import { listEvents, listNews, syncFeeds } from "@/server/feeds";
import { listEventsPage } from "@/server/feeds/query";
import { feedItemId, storeChannelItems } from "@/server/feeds/store";
import type { NormalizedFeedItem } from "@/server/feeds/types";
import { ApiError } from "@/server/http/errors";
import { FIXTURE_NOW } from "./helpers";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterAll(async () => {
  await testDb.stop();
});

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status, code });
}

describe("listEvents / listNews over the synced fixtures", () => {
  beforeAll(async () => {
    await testDb.clear();
    const results = await syncFeeds();
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("defaults to events + deadlines from now to now + 14 days, soonest first", async () => {
    const items = await listEvents();
    expect(items.length).toBeGreaterThan(20);
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(["event", "deadline"]));
    const starts = items.map((i) => Date.parse(i.startsAt!));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    const horizon = FIXTURE_NOW.getTime() + 14 * 86_400_000;
    expect(starts.every((t) => t < horizon)).toBe(true);
    for (const item of items) {
      expect(FeedItemSchema.parse(item)).toEqual(item);
      const end = item.endsAt ? Date.parse(item.endsAt) : Date.parse(item.startsAt!);
      expect(end).toBeGreaterThanOrEqual(FIXTURE_NOW.getTime());
    }
    // Ongoing items (started in July / last week) overlap the window.
    expect(items.map((i) => i.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Rhodes Scholarship/),
        "Building a Lean Startup - Fall 2026",
        "Watson Fellowship Nomination Application Deadline: 9/30/2026",
      ]),
    );
    expect(new Set(items.map((i) => i.source))).toEqual(
      new Set(["wildcatsync", "hurt-hub", "library", "events-digest"]),
    );
  });

  it("ids are stable hashes of source + upstream id, unique per item", async () => {
    const items = await listEvents({ limit: 500, to: "2027-06-01T00:00:00Z" });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const doc = await FeedItem.findOne({ source: "hurt-hub", externalId: "hurt-hub:6189" }).lean();
    const item = items.find((i) => i.title === "AI, Systems, and the Future of Brand Building")!;
    expect(item.id).toBe(feedItemId("hurt-hub", doc!.externalId));
    expect(item.id).toMatch(/^[a-f0-9]{32}$/);
  });

  it("filters by source, kind, window and limit", async () => {
    const hub = await listEvents({ sources: ["hurt-hub"] });
    expect(hub.length).toBeGreaterThan(0);
    expect(hub.every((i) => i.source === "hurt-hub")).toBe(true);
    const two = await listEvents({ sources: "hurt-hub,library" });
    expect(new Set(two.map((i) => i.source))).toEqual(new Set(["hurt-hub", "library"]));

    const deadlines = await listEvents({ kinds: ["deadline"] });
    expect(deadlines.map((i) => i.title)).toEqual([
      "Watson Fellowship Nomination Application Deadline: 9/30/2026",
    ]);

    const tomorrow = await listEvents({ from: "2026-10-01T04:00:00Z", to: "2026-10-02T04:00:00Z" });
    expect(
      tomorrow.every((i) => Date.parse(i.startsAt!) < Date.parse("2026-10-02T04:00:00Z")),
    ).toBe(true);
    expect(tomorrow.map((i) => i.title)).toContain("Browsing Book Fair");
    // Wednesday Night Zen ends at 8 pm ET today, before the window.
    expect(tomorrow.map((i) => i.title)).not.toContain("Wednesday Night Zen");

    expect(await listEvents({ limit: 3 })).toHaveLength(3);
    // `from` alone means from + 14 days.
    const late = await listEvents({ from: "2026-10-20T00:00:00-04:00" });
    expect(late.every((i) => Date.parse(i.startsAt!) < Date.parse("2026-11-03T04:00:00Z"))).toBe(
      true,
    );
    expect(late.length).toBeGreaterThan(0);
  });

  it("q matches every word of title, location or summary, ignoring case and accents", async () => {
    const voter = await listEvents({ q: "  VOTER   registration " });
    expect(voter.map((i) => i.title)).toEqual([
      "Voter Registration Drive",
      "Voter Registration Drive",
    ]);
    const byLocation = await listEvents({ q: "mauze terrace" });
    expect(byLocation.map((i) => i.title)).toEqual(["Fall 2026 Neuro Night"]);
    const bySummary = await listEvents({ q: "pizza neuroscience" });
    expect(bySummary.map((i) => i.title)).toEqual(["Fall 2026 Neuro Night"]);
    expect(await listEvents({ q: "(.*" })).toEqual([]);
    expect(await listEvents({ q: "voter nomatchword" })).toEqual([]);
  });

  it("rejects invalid input with 400 validation_failed", async () => {
    await expectApiError(listEvents({ kinds: ["party"] }), 400, "validation_failed");
    await expectApiError(listEvents({ sources: ["handshake"] }), 400, "validation_failed");
    await expectApiError(listEvents({ limit: 501 }), 400, "validation_failed");
    await expectApiError(listEvents({ from: "yesterday" }), 400, "validation_failed");
    await expectApiError(
      listEvents({ from: "2026-10-02T00:00:00Z", to: "2026-10-01T00:00:00Z" }),
      400,
      "validation_failed",
    );
  });

  it("listNews: newest first, news only, stale sticky stories absent", async () => {
    const news = await listNews({ limit: 100 });
    expect(news).toHaveLength(14 + 10 + 8);
    expect(news.every((i) => i.kind === "news")).toBe(true);
    const dates = news.map((i) => Date.parse(i.startsAt!));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    expect(news.some((i) => /\/news\/(2022|2023)\//.test(i.url))).toBe(false);
    expect(await listNews()).toHaveLength(20);
    const davidsonian = await listNews({ sources: ["davidsonian"] });
    expect(davidsonian).toHaveLength(10);
    expect((await listNews({ q: "nike" })).map((i) => i.title)).toEqual([
      "Davidson Athletics signs with Nike after Under Armour split",
    ]);
    await expectApiError(listNews({ limit: 0 }), 400, "validation_failed");
  });

  it("never serves a leftover kind 'hours' row (LibCal hours are no longer synced)", async () => {
    await FeedItem.collection.insertOne({
      source: "library",
      externalId: "hours:15880@2026-09-30",
      channel: "hours",
      kind: "hours",
      title: "E.H. Little Library",
      url: "https://davidson.libcal.com/hours",
      startsAt: new Date("2026-09-30T04:00:00Z"),
      endsAt: new Date("2026-10-01T04:00:00Z"),
      allDay: true,
      location: null,
      summaryText: "Closed for Renovation",
      searchText: "e.h. little library closed for renovation",
      fetchedAt: FIXTURE_NOW,
      expiresAt: new Date("2026-11-30T04:00:00Z"),
    });
    const library = await listEvents({ sources: ["library"], q: "renovation" });
    expect(library).toEqual([]);
    expect((await listEvents({ sources: ["library"] })).every((i) => i.kind === "event")).toBe(
      true,
    );
    await expectApiError(listEvents({ kinds: ["hours"] }), 400, "validation_failed");
  });
});

describe("listEvents across the 2026-11-01 DST change", () => {
  beforeAll(async () => {
    await testDb.clear();
  });

  it("an all-day item on 2026-11-01 fills the 25-hour ET day and appears once", async () => {
    await storeChannelItems(
      "wildcatsync",
      "events",
      [
        {
          source: "wildcatsync",
          channel: "events",
          externalId: "dst-day",
          kind: "event",
          title: "Daylight saving ends",
          url: "https://wildcatsync.davidson.edu/event/99",
          startsAt: new Date("2026-11-01T04:00:00Z"),
          endsAt: new Date("2026-11-02T05:00:00Z"),
          allDay: true,
          location: null,
          summaryText: null,
        },
      ],
      FIXTURE_NOW,
      { kind: "none" },
    );
    const day = await listEvents({
      from: "2026-11-01T00:00:00-04:00",
      to: "2026-11-02T00:00:00-05:00",
    });
    expect(day.map((i) => [i.title, i.allDay, i.startsAt, i.endsAt])).toEqual([
      ["Daylight saving ends", true, "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"],
    ]);
    // The late evening of Nov 1 (EST) still overlaps; Nov 2 does not.
    expect(
      await listEvents({ from: "2026-11-02T04:30:00Z", to: "2026-11-02T04:45:00Z" }),
    ).toHaveLength(1);
    expect(
      await listEvents({ from: "2026-11-02T05:00:00Z", to: "2026-11-03T05:00:00Z" }),
    ).toHaveLength(0);
  });
});

describe("listEvents: open-ended events and paging", () => {
  beforeAll(async () => {
    await testDb.clear();
    const digestEvent = (id: string, start: string): NormalizedFeedItem => ({
      source: "events-digest",
      channel: "events",
      externalId: id,
      kind: "event",
      title: id,
      url: `https://www.davidson.edu/events/booking/${id}`,
      startsAt: new Date(start),
      endsAt: null,
      allDay: false,
      location: null,
      summaryText: null,
    });
    await storeChannelItems(
      "events-digest",
      "events",
      [
        digestEvent("cinema", "2026-10-05T21:00:00Z"),
        digestEvent("lecture", "2026-10-05T23:00:00Z"),
        digestEvent("concert", "2026-10-06T23:00:00Z"),
      ],
      FIXTURE_NOW,
      { kind: "none" },
    );
  });

  it("an event without an end stays listed for two hours after it starts", async () => {
    const at = (iso: string) =>
      listEvents({ from: iso, to: "2026-10-07T00:00:00Z" }, { refresh: false }).then((items) =>
        items.map((i) => i.title),
      );
    expect(await at("2026-10-05T21:05:00Z")).toEqual(["cinema", "lecture", "concert"]);
    expect(await at("2026-10-05T22:59:00Z")).toEqual(["cinema", "lecture", "concert"]);
    expect(await at("2026-10-05T23:00:00Z")).toEqual(["lecture", "concert"]);
    const item = (await listEvents({ from: "2026-10-05T21:30:00Z" }, { refresh: false }))[0]!;
    expect(item).toMatchObject({ title: "cinema", endsAt: null });
  });

  it("listEventsPage says when the list was cut at the limit", async () => {
    const window = { from: "2026-10-05T00:00:00Z", to: "2026-10-07T00:00:00Z" };
    expect(await listEventsPage({ ...window, limit: 2 }, { refresh: false })).toMatchObject({
      items: [{ title: "cinema" }, { title: "lecture" }],
      hasMore: true,
    });
    const all = await listEventsPage({ ...window, limit: 3 }, { refresh: false });
    expect([all.items.length, all.hasMore]).toEqual([3, false]);
  });
});
