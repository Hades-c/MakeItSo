import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { SearchResultSchema } from "@/lib/api/search";
import type { Flags } from "@/lib/flags";
import { getDb } from "@/server/db";
import { syncFeeds } from "@/server/feeds";
import { storeChannelItems } from "@/server/feeds/store";
import { search, type SearchContext } from "@/server/search";
import { search as events } from "@/server/search/providers/events";
import { FIXTURE_NOW } from "./helpers";

const ALL_ON: Flags = {
  careers: true,
  events: true,
  alumni: true,
  ai: true,
  rmp: true,
  rmpSummaries: false,
};

function ctx(flags: Partial<Flags> = {}): SearchContext {
  return {
    user: { id: "0123456789abcdef01234567", email: "sam@davidson.edu", name: "Sam" },
    flags: { ...ALL_ON, ...flags },
    isVerifiedDavidson: async () => false,
    now: FIXTURE_NOW,
  };
}

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
  await syncFeeds();
});

afterAll(async () => {
  await testDb.stop();
});

describe("events search provider", () => {
  it("finds upcoming items with their own source tag and a link to the filtered events page", async () => {
    const results = await events("voter registration", 8, ctx());
    expect(results).toHaveLength(2);
    for (const result of results) expect(SearchResultSchema.parse(result)).toEqual(result);
    expect(results[0]).toEqual({
      kind: "event",
      id: expect.stringMatching(/^[a-f0-9]{32}$/),
      title: "Voter Registration Drive",
      subtitle: "Wed, Sep 30 · 3:00 PM · Union Tables by the Fireplace",
      href: "/events?q=Voter+Registration+Drive",
      source: "wildcatsync",
    });
    expect(new Set(results.map((r) => r.id)).size).toBe(2);
  });

  it("labels deadlines and all-day items, and respects the limit", async () => {
    const [watson] = await events("watson", 8, ctx());
    expect(watson!.subtitle).toBe("Due Wed, Sep 30, 3:00 PM · Online");
    expect(await events("book", 1, ctx())).toHaveLength(1);
  });

  it("ranks title matches above summary-only matches", async () => {
    await storeChannelItems(
      "hurt-hub",
      "events",
      [
        {
          source: "hurt-hub",
          channel: "events",
          externalId: "rank-summary",
          kind: "event",
          title: "Info session",
          url: "https://hurthub.davidson.edu/event/info/",
          startsAt: new Date("2026-10-01T13:00:00Z"),
          endsAt: new Date("2026-10-01T14:00:00Z"),
          allDay: false,
          location: null,
          summaryText: "Get ready for the zebrafish career fair.",
        },
        {
          source: "hurt-hub",
          channel: "events",
          externalId: "rank-title",
          kind: "event",
          title: "Zebrafish career fair",
          url: "https://hurthub.davidson.edu/event/fair/",
          startsAt: new Date("2026-10-09T13:00:00Z"),
          endsAt: new Date("2026-10-09T14:00:00Z"),
          allDay: true,
          location: null,
          summaryText: null,
        },
      ],
      FIXTURE_NOW,
      { kind: "none" },
    );
    const results = await events("zebrafish", 8, ctx());
    expect(results.map((r) => r.title)).toEqual(["Zebrafish career fair", "Info session"]);
    expect(results[0]!.subtitle).toBe("Fri, Oct 9 · All day");
  });

  it("returns nothing while FEATURE_EVENTS is off, and nothing past 30 days", async () => {
    expect(await events("voter", 8, ctx({ events: false }))).toEqual([]);
    // "Silent Book Club" on 2026-11-17 is beyond the 30-day search window.
    const club = await events("silent book club", 20, ctx());
    expect(club.every((r) => !r.subtitle?.includes("Nov 17"))).toBe(true);
  });

  it("feeds the global search", async () => {
    const results = await search("watson", 8, ctx());
    expect(results).toContainEqual(
      expect.objectContaining({ kind: "event", source: "wildcatsync" }),
    );
  });
});
