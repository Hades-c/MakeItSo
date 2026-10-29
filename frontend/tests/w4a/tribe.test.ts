import { describe, expect, it } from "vitest";
import { hurtHubExternalId, normalizeTribeEvents } from "@/server/feeds/tribe";
import { context, fixture } from "./helpers";

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
