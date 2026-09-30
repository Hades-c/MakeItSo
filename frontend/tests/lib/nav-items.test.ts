import { describe, expect, it } from "vitest";
import { activeNavKey, BOTTOM_TAB_KEYS, NAV_ITEMS } from "@/components/app/nav-items";

describe("hub navigation", () => {
  it("matches a section and its sub-pages", () => {
    expect(activeNavKey("/today", "sidebar")).toBe("today");
    expect(activeNavKey("/courses", "sidebar")).toBe("courses");
    expect(activeNavKey("/courses/202602/CSC-221", "sidebar")).toBe("courses");
    expect(activeNavKey("/careers/software-engineering", "sidebar")).toBe("careers");
    expect(activeNavKey("/plan", "tabs")).toBe("plan");
  });

  it("does not match look-alike prefixes or other pages", () => {
    expect(activeNavKey("/courseshop", "sidebar")).toBeNull();
    expect(activeNavKey("/profile", "sidebar")).toBeNull();
    expect(activeNavKey("/", "tabs")).toBeNull();
  });

  it("puts Alumni under Careers on the phone tab bar", () => {
    expect(activeNavKey("/alumni", "sidebar")).toBe("alumni");
    expect(activeNavKey("/alumni", "tabs")).toBe("careers");
  });

  it("has five phone tabs and six sidebar entries with one label each", () => {
    expect(BOTTOM_TAB_KEYS).toEqual(["today", "courses", "plan", "careers", "events"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Today",
      "Courses",
      "My plan",
      "Careers",
      "Events",
      "Alumni",
    ]);
  });
});
