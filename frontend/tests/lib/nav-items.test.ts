import { describe, expect, it } from "vitest";
import {
  activeNavKey,
  ALL_NAV_KEYS,
  BOTTOM_TAB_KEYS,
  bottomTabItems,
  NAV_ITEMS,
  navSectionOf,
  sidebarItems,
  type NavKey,
} from "@/components/app/nav-items";

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

  it("finds the section of a path whether or not it is shown", () => {
    expect(navSectionOf("/alumni")).toBe("alumni");
    expect(navSectionOf("/events/whatever")).toBe("events");
    expect(navSectionOf("/profile")).toBeNull();
  });
});

describe("hub navigation with sections hidden", () => {
  const CORE: NavKey[] = ["today", "courses", "plan"];
  const keys = (items: { key: NavKey }[]) => items.map((i) => i.key);

  it("shows everything by default", () => {
    expect(ALL_NAV_KEYS).toEqual(NAV_ITEMS.map((i) => i.key));
    expect(keys(sidebarItems())).toEqual(ALL_NAV_KEYS);
    expect(keys(bottomTabItems())).toEqual(BOTTOM_TAB_KEYS);
  });

  it("keeps the canonical order whatever order the keys come in", () => {
    const nav: NavKey[] = ["alumni", "events", "plan", "today", "courses"];
    expect(keys(sidebarItems(nav))).toEqual(["today", "courses", "plan", "events", "alumni"]);
    expect(keys(bottomTabItems(nav))).toEqual(["today", "courses", "plan", "events"]);
  });

  it("drops hidden tabs: four without Events or Careers, three without both", () => {
    expect(keys(bottomTabItems([...CORE, "careers", "alumni"]))).toEqual([...CORE, "careers"]);
    expect(keys(bottomTabItems([...CORE, "events"]))).toEqual([...CORE, "events"]);
    expect(keys(bottomTabItems(CORE))).toEqual(CORE);
  });

  it("never marks a hidden section current", () => {
    const noEvents: NavKey[] = [...CORE, "careers", "alumni"];
    expect(activeNavKey("/events", "sidebar", noEvents)).toBeNull();
    expect(activeNavKey("/events", "tabs", noEvents)).toBeNull();
    expect(activeNavKey("/careers/law", "sidebar", [...CORE, "events"])).toBeNull();
    expect(activeNavKey("/today", "tabs", CORE)).toBe("today");
  });

  it("highlights Careers on /alumni on phones only when both are shown", () => {
    expect(activeNavKey("/alumni", "tabs", [...CORE, "careers", "alumni"])).toBe("careers");
    expect(activeNavKey("/alumni", "sidebar", [...CORE, "careers", "alumni"])).toBe("alumni");
    // Alumni hidden (its page is a 404): nothing is current, on either surface.
    expect(activeNavKey("/alumni", "tabs", [...CORE, "careers"])).toBeNull();
    expect(activeNavKey("/alumni", "sidebar", [...CORE, "careers"])).toBeNull();
    // Careers hidden: no Careers tab to highlight.
    expect(activeNavKey("/alumni", "tabs", [...CORE, "events", "alumni"])).toBeNull();
    expect(activeNavKey("/alumni", "sidebar", [...CORE, "events", "alumni"])).toBe("alumni");
  });
});
