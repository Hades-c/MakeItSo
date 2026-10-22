import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENTS_VIEW,
  EVENT_SOURCE_IDS,
  EVENTS_MAX_LIMIT,
  EVENTS_PAGE_SIZE,
  eventsHref,
  hasEventFilters,
  nextEventsLimit,
  normalizeEventsQuery,
  parseEventsParams,
} from "@/app/(hub)/events/_lib/params";
import { FEED_SOURCE_IDS } from "@/lib/types/feeds";

function paramsOf(href: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of new URL(href, "http://localhost").searchParams) {
    const existing = out[key];
    out[key] = existing === undefined ? value : [...[existing].flat(), value];
  }
  return out;
}

describe("parseEventsParams", () => {
  it("defaults to the next 14 days, every source and kind, 50 items", () => {
    expect(parseEventsParams()).toEqual(DEFAULT_EVENTS_VIEW);
    expect(parseEventsParams({})).toEqual({
      range: "14d",
      sources: [],
      kinds: [],
      q: "",
      limit: EVENTS_PAGE_SIZE,
    });
  });

  it("reads repeated and comma-separated lists, in registry order, once each", () => {
    expect(
      parseEventsParams({
        range: "week",
        sources: ["library", "wildcatsync,library"],
        kinds: "deadline",
      }),
    ).toMatchObject({ range: "week", sources: ["wildcatsync", "library"], kinds: ["deadline"] });
  });

  it("drops unknown or news-only values instead of failing", () => {
    expect(
      parseEventsParams({
        range: ["month", "today"],
        sources: ["davidsonian", "davidson-news", "evil.example", " hurt-hub "],
        kinds: ["news", "hours", "event"],
      }),
    ).toMatchObject({ range: "14d", sources: ["hurt-hub"], kinds: ["event"] });
  });

  it("treats every source or both kinds as no filter", () => {
    const view = parseEventsParams({ sources: [...EVENT_SOURCE_IDS], kinds: "event,deadline" });
    expect(view.sources).toEqual([]);
    expect(view.kinds).toEqual([]);
  });

  it("only offers the feed sources that carry events", () => {
    expect(
      EVENT_SOURCE_IDS.every((id) => (FEED_SOURCE_IDS as readonly string[]).includes(id)),
    ).toBe(true);
    expect(EVENT_SOURCE_IDS).toEqual(["wildcatsync", "hurt-hub", "library", "events-digest"]);
  });

  it("normalises the search words like the API does", () => {
    expect(parseEventsParams({ q: "  Voter   registration " }).q).toBe("Voter registration");
    expect(parseEventsParams({ q: ["first", "second"] }).q).toBe("first");
    expect(normalizeEventsQuery("x".repeat(150))).toHaveLength(100);
    expect(normalizeEventsQuery("ｆｕｌｌ")).toBe("full");
  });

  it("accepts a limit from 1 to 500, else the page size", () => {
    expect(parseEventsParams({ limit: "75" }).limit).toBe(75);
    expect(parseEventsParams({ limit: "9999" }).limit).toBe(EVENTS_MAX_LIMIT);
    for (const bad of ["0", "-5", "abc", "1e3", "", "12.5"]) {
      expect(parseEventsParams({ limit: bad }).limit, bad).toBe(EVENTS_PAGE_SIZE);
    }
  });
});

describe("eventsHref", () => {
  it("leaves defaults out and keeps lists canonical", () => {
    expect(eventsHref(DEFAULT_EVENTS_VIEW)).toBe("/events");
    expect(eventsHref(DEFAULT_EVENTS_VIEW, { range: "today" })).toBe("/events?range=today");
    expect(
      eventsHref({
        range: "week",
        sources: ["wildcatsync", "library"],
        kinds: ["deadline"],
        q: " book fair ",
        limit: 100,
      }),
    ).toBe(
      "/events?sources=wildcatsync&sources=library&kinds=deadline&q=book+fair&range=week&limit=100",
    );
  });

  it("round-trips through parseEventsParams", () => {
    const view = {
      range: "today" as const,
      sources: ["hurt-hub" as const],
      kinds: ["event" as const],
      q: "startup",
      limit: 150,
    };
    expect(parseEventsParams(paramsOf(eventsHref(view)))).toEqual(view);
    expect(parseEventsParams(paramsOf(eventsHref(DEFAULT_EVENTS_VIEW)))).toEqual(
      DEFAULT_EVENTS_VIEW,
    );
  });
});

describe("filters and paging", () => {
  it("counts sources, kinds and words as filters, never the date range", () => {
    expect(hasEventFilters(DEFAULT_EVENTS_VIEW)).toBe(false);
    expect(hasEventFilters({ ...DEFAULT_EVENTS_VIEW, range: "today" })).toBe(false);
    expect(hasEventFilters({ ...DEFAULT_EVENTS_VIEW, q: "zen" })).toBe(true);
    expect(hasEventFilters({ ...DEFAULT_EVENTS_VIEW, sources: ["library"] })).toBe(true);
    expect(hasEventFilters({ ...DEFAULT_EVENTS_VIEW, kinds: ["deadline"] })).toBe(true);
  });

  it("shows 50 more at a time, up to the API's 500", () => {
    expect(nextEventsLimit(50)).toBe(100);
    expect(nextEventsLimit(475)).toBe(500);
    expect(nextEventsLimit(500)).toBeNull();
  });
});
