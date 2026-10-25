import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import type { FeedItem, FeedSourceId } from "@/lib/types/feeds";
import { getDb } from "@/server/db";
import { listEvents, listEventsPage } from "@/server/feeds";
import { foldTitle, groupListings, mergeListings } from "@/server/feeds/merge";
import { storeChannelItems } from "@/server/feeds/store";
import type { NormalizedFeedItem } from "@/server/feeds/types";
import { buildAgenda, summaryInput, todaySummary } from "@/server/today";
import { FIXTURE_NOW, TZ } from "./helpers";

/**
 * One campus event listed by several feeds (LibCal and WildcatSync both list "Scary Stories to Tell in the Dark",
 * same time, same room) is one event on /events, on Today's timeline and in the day summary.
 */

const edt = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00-04:00`);

function listing(source: FeedSourceId, over: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    source,
    kind: "event",
    title: "Scary Stories to Tell in the Dark",
    url: "https://davidson.libcal.com/event/1",
    startsAt: edt("18:00").toISOString(),
    endsAt: edt("19:30").toISOString(),
    allDay: false,
    location: "Baxter-Davidson Room",
    summaryText: null,
    fetchedAt: edt("09:00").toISOString(),
    ...over,
  };
}

const ids = (items: readonly FeedItem[]) => items.map((item) => item.id);

describe("groupListings / mergeListings", () => {
  it("merges the LibCal and WildcatSync listings of one event, showing the library's", () => {
    const wildcat = listing("wildcatsync", {
      id: "w",
      url: "https://wildcatsync.davidson.edu/e/1",
    });
    const library = listing("library", { id: "l" });
    const groups = groupListings([wildcat, library], TZ);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ first: wildcat, shown: library });
    expect(groups[0]!.sources).toEqual(["wildcatsync", "library"]);
    expect(mergeListings([library, wildcat], TZ)).toEqual([library]);
  });

  it("folds case, accents, punctuation and '&' in titles and locations", () => {
    expect(foldTitle("  Scary Stories: To Tell in the DARK! ")).toBe(
      "scary stories to tell in the dark",
    );
    expect(foldTitle("Café Q&A")).toBe("cafe q and a");
    const merged = mergeListings(
      [
        listing("wildcatsync", { id: "w", title: "SCARY STORIES TO TELL IN THE DARK!" }),
        listing("library", { id: "l", location: "baxter–davidson room" }),
      ],
      TZ,
    );
    expect(ids(merged)).toEqual(["l"]);
  });

  it("needs starts at most five minutes apart", () => {
    const library = listing("library", { id: "l" });
    const near = listing("wildcatsync", { id: "near", startsAt: edt("18:05").toISOString() });
    const far = listing("wildcatsync", { id: "far", startsAt: edt("18:06").toISOString() });
    expect(ids(mergeListings([library, near], TZ))).toEqual(["l"]);
    expect(ids(mergeListings([library, far], TZ))).toEqual(["l", "far"]);
  });

  it("needs the same place: equal or contained locations, else the same day when one has none", () => {
    const library = listing("library", { id: "l" });
    const longer = listing("wildcatsync", {
      id: "longer",
      location: "E.H. Little Library, Baxter-Davidson Room",
    });
    const elsewhere = listing("wildcatsync", { id: "elsewhere", location: "Hance Auditorium" });
    const unplaced = listing("wildcatsync", { id: "unplaced", location: null });
    expect(ids(mergeListings([library, longer], TZ))).toEqual(["l"]);
    expect(ids(mergeListings([library, elsewhere], TZ))).toEqual(["l", "elsewhere"]);
    expect(ids(mergeListings([library, unplaced], TZ))).toEqual(["l"]);
    // Without a location, 11:58 pm and 12:01 am are different campus days.
    const lateLibrary = listing("library", {
      id: "late",
      location: null,
      startsAt: edt("23:58").toISOString(),
    });
    const afterMidnight = listing("wildcatsync", {
      id: "next-day",
      location: null,
      startsAt: edt("00:01", "2026-10-01").toISOString(),
    });
    expect(ids(mergeListings([lateLibrary, afterMidnight], TZ))).toEqual(["late", "next-day"]);
  });

  it("never merges a source with itself, other kinds, news or items without a start", () => {
    const first = listing("wildcatsync", { id: "a" });
    const second = listing("wildcatsync", { id: "b" });
    expect(ids(mergeListings([first, second], TZ))).toEqual(["a", "b"]);
    const deadline = listing("library", { id: "d", kind: "deadline", endsAt: null });
    expect(ids(mergeListings([first, deadline], TZ))).toEqual(["a", "d"]);
    const news = [
      listing("davidson-news", { id: "n1", kind: "news" }),
      listing("davidsonian", { id: "n2", kind: "news" }),
    ];
    expect(ids(mergeListings(news, TZ))).toEqual(["n1", "n2"]);
    const undated = [
      listing("wildcatsync", { id: "u1", startsAt: null, endsAt: null }),
      listing("library", { id: "u2", startsAt: null, endsAt: null }),
    ];
    expect(ids(mergeListings(undated, TZ))).toEqual(["u1", "u2"]);
  });

  it("prefers the host office's calendar, then WildcatSync, then the Events Digest", () => {
    const digest = listing("events-digest", { id: "digest", location: null });
    const wildcat = listing("wildcatsync", { id: "w" });
    const hub = listing("hurt-hub", { id: "hub", location: null });
    expect(ids(mergeListings([digest, wildcat], TZ))).toEqual(["w"]);
    expect(ids(mergeListings([digest, hub], TZ))).toEqual(["hub"]);
    const three = groupListings([digest, wildcat, listing("library", { id: "l" })], TZ);
    expect(three.map((group) => [group.shown.id, group.sources])).toEqual([
      ["l", ["events-digest", "wildcatsync", "library"]],
    ]);
  });

  it("is idempotent", () => {
    const items = [
      listing("wildcatsync", { id: "w" }),
      listing("library", { id: "l" }),
      listing("wildcatsync", { id: "other", title: "Pumpkin Carving" }),
    ];
    const once = mergeListings(items, TZ);
    expect(mergeListings(once, TZ)).toEqual(once);
  });
});

describe("listEvents / listEventsPage merge cross-source listings", () => {
  let testDb: TestDb;

  const stored = (
    source: FeedSourceId,
    externalId: string,
    title: string,
    start: string,
    location: string | null,
  ): NormalizedFeedItem => ({
    source,
    channel: "events",
    externalId,
    kind: "event",
    title,
    url:
      source === "library"
        ? `https://davidson.libcal.com/event/${externalId}`
        : `https://wildcatsync.davidson.edu/rsvp_boot?id=${externalId}`,
    startsAt: new Date(start),
    endsAt: new Date(Date.parse(start) + 90 * 60_000),
    allDay: false,
    location,
    summaryText: null,
  });

  beforeAll(async () => {
    testDb = await startTestDb();
    await getDb();
    await storeChannelItems(
      "library",
      "events",
      [
        stored(
          "library",
          "scary",
          "Scary Stories to Tell in the Dark",
          "2026-10-29T22:00:00Z",
          "Baxter-Davidson Room",
        ),
        stored("library", "pumpkins", "Pumpkin Carving", "2026-10-29T23:00:00Z", "Lilly Gallery"),
      ],
      FIXTURE_NOW,
      { kind: "none" },
    );
    await storeChannelItems(
      "wildcatsync",
      "events",
      [
        // Listed two minutes earlier, so the WildcatSync row is read first.
        stored(
          "wildcatsync",
          "9001",
          "Scary Stories to Tell in the Dark",
          "2026-10-29T21:58:00Z",
          "E.H. Little Library - Baxter-Davidson Room",
        ),
        // Same title and time, another room: another event.
        stored("wildcatsync", "9002", "Pumpkin Carving", "2026-10-29T23:00:00Z", "Union Atrium"),
      ],
      FIXTURE_NOW,
      { kind: "none" },
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  const window = { from: "2026-10-29T04:00:00Z", to: "2026-10-30T04:00:00Z" };

  it("lists the event once, as the library's listing, soonest first", async () => {
    const items = await listEvents(window, { refresh: false });
    expect(items.map((item) => [item.title, item.source])).toEqual([
      ["Scary Stories to Tell in the Dark", "library"],
      ["Pumpkin Carving", "library"],
      ["Pumpkin Carving", "wildcatsync"],
    ]);
  });

  it("counts events, not listings, for limit and hasMore", async () => {
    const one = await listEventsPage({ ...window, limit: 1 }, { refresh: false });
    expect(one.items.map((item) => item.source)).toEqual(["library"]);
    expect(one.hasMore).toBe(true);
    const all = await listEventsPage({ ...window, limit: 3 }, { refresh: false });
    expect([all.items.length, all.hasMore]).toEqual([3, false]);
    // Only the two listings of one event in the window: one item, nothing more.
    const scary = await listEventsPage(
      { from: "2026-10-29T21:00:00Z", to: "2026-10-29T22:30:00Z", limit: 1 },
      { refresh: false },
    );
    expect(scary.items.map((item) => item.source)).toEqual(["library"]);
    expect(scary.hasMore).toBe(false);
  });

  it("a source filter shows that source's own listing", async () => {
    const items = await listEvents({ ...window, sources: ["wildcatsync"] }, { refresh: false });
    expect(items.map((item) => [item.title, item.source])).toEqual([
      ["Scary Stories to Tell in the Dark", "wildcatsync"],
      ["Pumpkin Carving", "wildcatsync"],
    ]);
  });
});

describe("Today counts distinct events", () => {
  const NOON = edt("12:00");
  const twins = [
    listing("wildcatsync", { id: "w" }),
    listing("library", { id: "l" }),
    listing("wildcatsync", {
      id: "zen",
      title: "Wednesday Night Zen",
      location: "Oasis",
      startsAt: edt("19:00").toISOString(),
      endsAt: edt("20:00").toISOString(),
    }),
  ];
  const parts = {
    now: NOON,
    onboarded: true,
    standing: "first-year" as const,
    schedule: { entries: [], empty: "no-classes-today" as const, termCode: "202601" as const },
    termLabel: "Fall 2026",
    studentDeadlines: [],
    feedItems: twins,
  };

  it("the day summary counts the event once", () => {
    expect(summaryInput(parts).events?.map((event) => event.title)).toEqual([
      "Scary Stories to Tell in the Dark",
      "Wednesday Night Zen",
    ]);
    const summary = todaySummary(parts);
    expect(summary.eventsLeftToday).toBe(2);
    expect(summary.sentence).toContain("two campus events later today");
  });

  it("the timeline draws it once, with the library's tag", () => {
    const agenda = buildAgenda({
      day: "2026-09-30",
      schedule: { entries: [] },
      studentDeadlines: [],
      contentDeadlines: [],
      standing: "first-year",
      feedItems: twins,
      now: NOON,
    });
    const events = agenda.items.filter((item) => item.kind === "event");
    expect(events.map((item) => [item.title, item.source])).toEqual([
      ["Scary Stories to Tell in the Dark", "library"],
      ["Wednesday Night Zen", "wildcatsync"],
    ]);
    expect(agenda.moreEvents).toBe(0);
  });
});
