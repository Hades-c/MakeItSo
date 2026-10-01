import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import EventsPage, { generateMetadata } from "@/app/(hub)/events/page";
import { EventSourcesCard } from "@/app/(hub)/events/_components/event-sources";
import { EventsFilters } from "@/app/(hub)/events/_components/events-filters";
import { EventsResults } from "@/app/(hub)/events/_components/events-results";
import { LibraryHoursCard } from "@/app/(hub)/events/_components/library-hours";
import {
  loadEventSourceStatuses,
  loadEvents,
  loadLibraryHours,
  statusesFor,
} from "@/app/(hub)/events/_lib/load";
import { DEFAULT_EVENTS_VIEW, type EventsView } from "@/app/(hub)/events/_lib/params";
import { rangeWindow } from "@/app/(hub)/events/_lib/range";
import { getDb } from "@/server/db";
import { syncFeeds } from "@/server/feeds";

/**
 * /events against the real feeds service: fixtures synced into an in-memory MongoDB (EXTERNAL_MODE=fixtures, no
 * network), read through the page's loaders and rendered to HTML by its server components.
 */

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const TZ = "America/New_York";
const NOW = new Date("2026-09-30T12:00:00-04:00");

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterAll(async () => {
  await testDb.stop();
});

function view(patch: Partial<EventsView> = {}): EventsView {
  return { ...DEFAULT_EVENTS_VIEW, ...patch };
}

async function load(patch: Partial<EventsView> = {}) {
  const v = view(patch);
  return loadEvents(v, rangeWindow(v.range, NOW, TZ));
}

async function html(element: Promise<ReactNode> | ReactNode): Promise<string> {
  return renderToStaticMarkup(createElement(Fragment, null, await element));
}

describe("before the first sync", () => {
  afterEach(() => testDb.clear());

  it("lists nothing and says every calendar has not synced yet", async () => {
    expect(await load()).toEqual({ items: [], hasMore: false });
    const statuses = await loadEventSourceStatuses(NOW.getTime());
    expect(statuses).toEqual([
      { id: "wildcatsync", lastSync: null, status: "never" },
      { id: "hurt-hub", lastSync: null, status: "never" },
      { id: "library", lastSync: null, status: "never" },
      { id: "events-digest", lastSync: null, status: "never" },
    ]);
    const page = await html(
      EventsResults({ view: view(), window: rangeWindow("14d", NOW, TZ), now: NOW, timeZone: TZ }),
    );
    expect(page).toContain("The campus calendars have not synced yet");
    expect(page).toContain("No items through Tuesday, Oct 13.");
    expect(await html(EventSourcesCard({ now: NOW, timeZone: TZ }))).toContain("Not synced yet");
  });

  it("says the library hours are unavailable when LibCal has nothing for the day", async () => {
    // LibCal only publishes today: another day with nothing stored is a 404 from the service.
    const result = await loadLibraryHours("2026-10-02");
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    const card = await html(LibraryHoursCard({ today: "2026-10-02", now: NOW, timeZone: TZ }));
    expect(card).toContain("Library hours are unavailable right now.");
    expect(card).toContain('data-source="library"');
  });
});

describe("after a sync of the fixtures", () => {
  beforeAll(async () => {
    const results = await syncFeeds();
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("lists what is left of today, soonest first, ongoing items included", async () => {
    const { items, hasMore } = await load({ range: "today" });
    expect(hasMore).toBe(false);
    const titles = items.map((i) => i.title);
    expect(titles[0]).toMatch(/^Rhodes Scholarship/);
    expect(titles).toContain("Voter Registration Drive");
    expect(titles).toContain("Watson Fellowship Nomination Application Deadline: 9/30/2026");
    expect(titles).toContain("Rusk Crush");
    // Tomorrow is not today.
    expect(titles).not.toContain("Regular Morning Practice");
    expect(
      items.every(
        (i) => i.startsAt !== null && Date.parse(i.startsAt) < Date.parse("2026-10-01T04:00:00Z"),
      ),
    ).toBe(true);
  });

  it("filters by kind, source and words", async () => {
    const deadlines = await load({ kinds: ["deadline"] });
    expect(deadlines.items.map((i) => i.title)).toEqual([
      "Watson Fellowship Nomination Application Deadline: 9/30/2026",
    ]);
    const library = await load({ sources: ["library"] });
    expect(library.items.length).toBeGreaterThan(0);
    expect(new Set(library.items.map((i) => i.source))).toEqual(new Set(["library"]));
    expect(library.items.every((i) => i.kind === "event")).toBe(true);
    const voter = await load({ q: "voter registration" });
    expect(voter.items.map((i) => i.title)).toEqual([
      "Voter Registration Drive",
      "Voter Registration Drive",
    ]);
  });

  it("cuts at the limit and says there is more", async () => {
    const all = await load({ limit: 500 });
    expect(all.hasMore).toBe(false);
    const first = await load({ limit: 5 });
    expect(first.hasMore).toBe(true);
    expect(first.items.map((i) => i.id)).toEqual(all.items.slice(0, 5).map((i) => i.id));
    const exact = await load({ limit: all.items.length });
    expect(exact.hasMore).toBe(false);
  });

  it("knows when each calendar synced", async () => {
    const statuses = await loadEventSourceStatuses(NOW.getTime());
    expect(statuses.map((s) => s.id)).toEqual([
      "wildcatsync",
      "hurt-hub",
      "library",
      "events-digest",
    ]);
    expect(statuses.every((s) => s.status === "ok")).toBe(true);
    expect(new Set(statuses.map((s) => s.lastSync))).toEqual(new Set(["2026-09-30T16:00:00.000Z"]));
    expect(statusesFor(statuses, { sources: ["library"] }).map((s) => s.id)).toEqual(["library"]);
    expect(statusesFor(statuses, { sources: [] })).toHaveLength(4);
  });

  it("reads today's library hours", async () => {
    const result = await loadLibraryHours("2026-09-30");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hours.date).toBe("2026-09-30");
    expect(result.hours.locations.length).toBeGreaterThan(0);
    const card = await html(LibraryHoursCard({ today: "2026-09-30", now: NOW, timeZone: TZ }));
    expect(card).toContain("Music Library (Sloan 101)");
    expect(card).toContain("7am - 11:59pm");
    expect(card).toContain("Open now");
    expect(card).toContain("as of Sep 30, 12:00 PM");
    // LibCal locations without hours are left out.
    expect(card).not.toContain("Podcast Studio");
  });

  it("renders the results: day groups, tagged items, external links", async () => {
    const page = await html(
      EventsResults({
        view: view({ range: "week" }),
        window: rangeWindow("week", NOW, TZ),
        now: NOW,
        timeZone: TZ,
      }),
    );
    expect(page).toContain("This week:");
    expect(page).toContain("through Sunday, Oct 4.");
    expect(page).toMatch(/<h2[^>]*>Ongoing <span[^>]*>Started before today</);
    expect(page).toMatch(/<h2[^>]*>Today <span[^>]*>Wednesday, September 30</);
    expect(page).toMatch(/<h2[^>]*>Tomorrow <span[^>]*>Thursday, October 1</);
    expect(page).toContain("Friday, October 2");
    const rows = page.match(/<li data-testid="event-item"[^>]*>/g) ?? [];
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows)
      expect(row).toMatch(/data-source="(wildcatsync|hurt-hub|library|events-digest)"/);
    const links =
      page.match(/<a href="https:[^"]+" target="_blank" rel="noopener noreferrer"/g) ?? [];
    expect(links.length).toBe(rows.length);
    expect(page).toContain("Due 3:00 PM");
    expect(page).not.toContain("Show more");
  });

  it("offers Show more when the page is cut", async () => {
    const page = await html(
      EventsResults({
        view: view({ limit: 5 }),
        window: rangeWindow("14d", NOW, TZ),
        now: NOW,
        timeZone: TZ,
      }),
    );
    expect(page).toContain("At least 5 items");
    expect(page).toMatch(/href="\/events\?limit=55"[^>]*>Show more</);
  });

  it("explains an empty filtered list", async () => {
    const page = await html(
      EventsResults({
        view: view({ q: "underwater basket weaving", range: "today" }),
        window: rangeWindow("today", NOW, TZ),
        now: NOW,
        timeZone: TZ,
      }),
    );
    expect(page).toContain("Nothing matches these filters");
    expect(page).toContain('href="/events?range=today"');
    expect(page).toContain("Show the next 14 days");
  });

  it("shows the sources with their as-of times", async () => {
    const card = await html(EventSourcesCard({ now: NOW, timeZone: TZ }));
    expect(card.match(/as of Sep 30, 12:00 PM/g)).toHaveLength(4);
    expect(card).toContain(">WildcatSync<");
    expect(card).toContain(">Events Digest<");
  });
});

describe("the page", () => {
  type AnyElement = ReactElement<Record<string, unknown>>;

  function find(node: unknown, type: unknown): AnyElement | null {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = find(child, type);
        if (found) return found;
      }
      return null;
    }
    if (!isValidElement(node)) return null;
    const element = node as AnyElement;
    if (element.type === type) return element;
    return find(element.props.children, type);
  }

  it("parses the URL into the filters and the results window, from the server's now", async () => {
    const page = await EventsPage({
      searchParams: Promise.resolve({ range: "week", sources: "library", q: " book " }),
    });
    const filters = find(page, EventsFilters);
    expect(filters?.props.view).toEqual({
      range: "week",
      sources: ["library"],
      kinds: [],
      q: "book",
      limit: 50,
    });
    const results = find(page, EventsResults);
    expect(results?.props.window).toEqual(rangeWindow("week", NOW, TZ));
    expect(results?.props.timeZone).toBe(TZ);
    await expect(generateMetadata()).resolves.toEqual({ title: "Events" });
  });

  it("puts today's library hours before the list (phone order)", async () => {
    const page = await EventsPage({ searchParams: Promise.resolve({}) });
    const order: unknown[] = [];
    (function walk(node: ReactNode): void {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement(node)) return;
      const element = node as AnyElement;
      order.push(element.type);
      walk(element.props.children as ReactNode);
    })(page);
    const at = (type: unknown) => order.indexOf(type);
    expect(at(LibraryHoursCard)).toBeGreaterThan(-1);
    expect(at(LibraryHoursCard)).toBeLessThan(at(EventsFilters));
    expect(at(EventsResults)).toBeLessThan(at(EventSourcesCard));
  });

  it("answers 404 while FEATURE_EVENTS is off", async () => {
    vi.stubEnv("FEATURE_EVENTS", "false");
    await expect(EventsPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
