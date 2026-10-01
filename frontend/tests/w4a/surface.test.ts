import { describe, expect, it } from "vitest";
import * as feeds from "@/server/feeds";

/** The frozen service surface (PLAN §4.1.5): a rename is a visible contract change. */
describe("server/feeds", () => {
  it("exports exactly listEvents, listEventsPage, listNews, getLibraryHours and syncFeeds", () => {
    const functions = Object.entries(feeds)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort();
    expect(functions).toEqual([
      "getLibraryHours",
      "listEvents",
      "listEventsPage",
      "listNews",
      "syncFeeds",
    ]);
  });
});

describe("isNewsOnlyFeedSource (the hub's Sources panel leaves these out until news is shown)", () => {
  it("is true for the news-only feeds and false for every feed with events or hours", async () => {
    const { isNewsOnlyFeedSource } = await import("@/server/feeds/config");
    expect(isNewsOnlyFeedSource("davidsonian")).toBe(true);
    expect(isNewsOnlyFeedSource("davidson-news")).toBe(true);
    for (const id of ["wildcatsync", "hurt-hub", "library", "events-digest", "course-schedule"]) {
      expect(isNewsOnlyFeedSource(id), id).toBe(false);
    }
  });
});
