import { describe, expect, it } from "vitest";
import {
  LIBRARY_HOURS_PAGE,
  LibCalHoursTodaySchema,
  LibCalLocationSchema,
  libCalDate,
  normalizeLibraryHours,
  normalizeLocationHours,
  parseClock,
} from "@/server/feeds/libcal";
import { hurtHubExternalId, normalizeTribeEvents } from "@/server/feeds/tribe";
import { context, fixture, TZ } from "./helpers";

describe("LibCal hours", () => {
  it.each([
    ["7am", 420],
    ["11:59pm", 1439],
    ["12am", 0],
    ["12pm", 720],
    ["7:30 AM", 450],
    ["noon", 720],
    ["midnight", 0],
    ["25pm", null],
    ["soon", null],
  ])("parseClock(%s) = %s", (text, minutes) => {
    expect(parseClock(text)).toBe(minutes);
  });

  it("normalises the recorded payload: 11 locations, statuses and times in ET", () => {
    const data = LibCalHoursTodaySchema.parse(JSON.parse(fixture("library/hours-today.json")));
    const items = normalizeLibraryHours(data, {
      ...context("library", "hours"),
      date: "2026-09-30",
    });
    expect(items).toHaveLength(11);
    const byName = new Map(items.map((i) => [i.title, i]));
    expect(byName.get("E.H. Little Library")!.hours).toMatchObject({
      status: "text",
      text: "Closed for Renovation",
    });
    const music = byName.get("Music Library (Sloan 101)")!;
    expect(music.hours!.status).toBe("open");
    expect(music.startsAt?.toISOString()).toBe("2026-09-30T11:00:00.000Z");
    expect(music.endsAt?.toISOString()).toBe("2026-10-01T03:59:00.000Z");
    expect(byName.get("Lilly Family Gallery")!.hours!.status).toBe("24hours");
    // "not-set" means LibCal has nothing for today: blank, not closed.
    expect(byName.get("Chambers Building")!.hours).toMatchObject({ status: "not-set", text: "" });
    expect(items.every((i) => i.kind === "hours" && i.url === LIBRARY_HOURS_PAGE)).toBe(true);
    expect(items.map((i) => i.hours!.order)).toEqual([...Array(11).keys()]);
  });

  it("closing after midnight lands on the next day; unknown statuses fall back to text/not-set", () => {
    const late = normalizeLocationHours(
      { lid: "1", name: "Late", times: { status: "open", hours: [{ from: "8am", to: "2am" }] } },
      "2026-10-31",
      TZ,
    );
    expect([late.opensAt, late.closesAt]).toEqual([
      "2026-10-31T12:00:00.000Z",
      "2026-11-01T07:00:00.000Z", // 2 am EST: the clocks went back from 2 am EDT to 1 am that night
    ]);
    const split = normalizeLocationHours(
      {
        lid: "2",
        name: "Split",
        times: {
          status: "open",
          hours: [
            { from: "9am", to: "12pm" },
            { from: "1pm", to: "5pm" },
          ],
        },
        rendered: "9am - 12pm, 1pm - 5pm",
      },
      "2026-10-01",
      TZ,
    );
    expect([split.opensAt, split.closesAt, split.text]).toEqual([
      "2026-10-01T13:00:00.000Z",
      "2026-10-01T21:00:00.000Z",
      "9am - 12pm, 1pm - 5pm",
    ]);
    const odd = LibCalLocationSchema.parse({
      lid: 3,
      name: "X",
      times: { status: "weird" },
      rendered: "By appointment",
    });
    expect(normalizeLocationHours(odd, "2026-10-01", TZ)).toMatchObject({
      id: "3",
      status: "text",
      text: "By appointment",
      opensAt: null,
    });
    const blank = LibCalLocationSchema.parse({ lid: 4, name: "Y", times: { status: "weird" } });
    expect(normalizeLocationHours(blank, "2026-10-01", TZ).status).toBe("not-set");
  });

  it("LibCal's weekday decides the date around midnight", () => {
    const data = LibCalHoursTodaySchema.parse({
      locations: [{ lid: 1, name: "A", day: "Wednesday" }],
    });
    expect(libCalDate(data, "2026-09-30")).toBe("2026-09-30");
    expect(libCalDate(data, "2026-10-01")).toBe("2026-09-30");
    expect(libCalDate(LibCalHoursTodaySchema.parse({ locations: [] }), "2026-10-01")).toBe(
      "2026-10-01",
    );
  });
});

describe("Hurt Hub Tribe fallback", () => {
  it("normalises the REST payload with decoded titles and venue locations", () => {
    const { events } = JSON.parse(fixture("hurt-hub/tribe-events.json")) as { events: unknown[] };
    const { items, skipped } = normalizeTribeEvents(events, {
      ...context("hurt-hub"),
      fallbackUrl: "https://hurthub.davidson.edu/events/",
    });
    expect([items.length, skipped]).toEqual([9, 0]);
    const lean = items.find((i) => i.externalId === "hurt-hub:1862")!;
    expect(lean.title).toBe("Building a Lean Startup – Fall 2026");
    expect(lean.location).toBe(
      "The Hurt Hub at Davidson College, 210 Delburg Street, Davidson, NC 28036",
    );
    expect(lean.summaryText).not.toMatch(/<[a-z]/i);
  });

  it("all-day events, bad rows and drafts", () => {
    const { items, skipped } = normalizeTribeEvents(
      [
        {
          id: 7,
          url: "https://hurthub.davidson.edu/event/fair/",
          title: "Fair",
          all_day: true,
          start_date: "2026-10-10 00:00:00",
          end_date: "2026-10-11 23:59:59",
          timezone: "America/New_York",
        },
        { id: "x", title: "no url" },
        {
          id: 8,
          url: "https://hurthub.davidson.edu/event/draft/",
          title: "Draft",
          status: "draft",
          start_date: "2026-10-10 10:00:00",
        },
      ],
      { ...context("hurt-hub"), fallbackUrl: "https://hurthub.davidson.edu/events/" },
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ allDay: true, externalId: "hurt-hub:7" });
    expect(items[0]!.startsAt?.toISOString()).toBe("2026-10-10T04:00:00.000Z");
    expect(items[0]!.endsAt?.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(skipped).toBe(1);
  });

  it("maps iCal UIDs to the shared post id", () => {
    expect(hurtHubExternalId("1862-1790189100-1794428100@hurthub.davidson.edu")).toBe(
      "hurt-hub:1862",
    );
    expect(hurtHubExternalId("other-uid@example.com")).toBe("other-uid@example.com");
  });
});
