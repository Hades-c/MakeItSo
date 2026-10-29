import { describe, expect, it } from "vitest";
import {
  activeNavKey,
  ALL_NAV_KEYS,
  BOTTOM_TAB_KEYS,
  bottomTabItems,
  NAV_ITEMS,
  navParentOf,
  navSectionOf,
  sidebarItems,
  sidebarSections,
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

  it("puts Syllabi under My plan on the phone tab bar (it has no tab)", () => {
    expect(activeNavKey("/syllabi", "sidebar")).toBe("syllabi");
    expect(activeNavKey("/syllabi", "tabs")).toBe("plan");
  });

  it("has five phone tabs and seven sidebar entries with one label each", () => {
    expect(BOTTOM_TAB_KEYS).toEqual(["today", "courses", "plan", "careers", "events"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Today",
      "Courses",
      "My plan",
      "Syllabi",
      "Careers",
      "Alumni",
      "Events",
    ]);
  });

  it("nests Syllabi under My plan and Alumni under Careers, nothing else", () => {
    expect(navParentOf("syllabi")).toBe("plan");
    expect(navParentOf("alumni")).toBe("careers");
    for (const key of BOTTOM_TAB_KEYS) expect(navParentOf(key)).toBeNull();
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
    expect(keys(sidebarItems(nav))).toEqual(["today", "courses", "plan", "alumni", "events"]);
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

describe("sidebarSections (the five tabs, with Syllabi under My plan and Alumni under Careers)", () => {
  const CORE: NavKey[] = ["today", "courses", "plan", "syllabi"];
  const shape = (nav?: NavKey[]) =>
    sidebarSections(nav).map((s) => [s.item.key, s.children.map((c) => c.key)]);

  it("has the phone tabs' five parents, in their order, and only two nested children", () => {
    expect(sidebarSections().map((s) => s.item.key)).toEqual(BOTTOM_TAB_KEYS);
    expect(shape()).toEqual([
      ["today", []],
      ["courses", []],
      ["plan", ["syllabi"]],
      ["careers", ["alumni"]],
      ["events", []],
    ]);
  });

  it("drops a hidden child, keeping its parent", () => {
    expect(shape([...CORE, "careers", "events"])).toEqual([
      ["today", []],
      ["courses", []],
      ["plan", ["syllabi"]],
      ["careers", []],
      ["events", []],
    ]);
  });

  it("drops a hidden parent with its children, never an empty entry", () => {
    expect(shape(CORE)).toEqual([
      ["today", []],
      ["courses", []],
      ["plan", ["syllabi"]],
    ]);
    // Alumni without Careers never comes from the flags (featureEnabled); it has no parent to sit under.
    expect(shape([...CORE, "alumni"]).map(([key]) => key)).toEqual(["today", "courses", "plan"]);
  });
});
