import { describe, expect, it } from "vitest";
import * as feeds from "@/server/feeds";

/** The frozen service surface (PLAN §4.1.5): a rename is a visible contract change. */
describe("server/feeds", () => {
  it("exports exactly listEvents, listNews, getLibraryHours and syncFeeds", () => {
    const functions = Object.entries(feeds)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort();
    expect(functions).toEqual(["getLibraryHours", "listEvents", "listNews", "syncFeeds"]);
  });
});
