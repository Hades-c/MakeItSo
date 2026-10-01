import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The /today route: it requires a session, decides "today" from the server clock in America/New_York, passes the
 * strip day from ?day= to the header and the timeline, and renders This week on campus only while FEATURE_EVENTS
 * is on (and the Careers link only while FEATURE_CAREERS is on). The panels are markers here; they are rendered
 * from data in today-panels.test.tsx.
 */

const session = vi.hoisted(() => ({ requireUser: vi.fn(async () => ({ id: "u1", name: "T" })) }));
vi.mock("@/server/auth/session", () => ({ requireUser: session.requireUser }));

function marker(name: string) {
  function Marker(props: Record<string, unknown>) {
    return (
      <div
        data-testid={name}
        data-props={JSON.stringify(props, (_k, v: unknown) =>
          v instanceof Date ? v.toISOString() : v,
        )}
      />
    );
  }
  return Marker;
}
vi.mock("@/app/(hub)/today/_components/today-header", () => ({ TodayHeader: marker("header") }));
vi.mock("@/app/(hub)/today/_components/today-actions", () => ({ TodayActions: marker("actions") }));
vi.mock("@/app/(hub)/today/_components/timeline-panel", () => ({
  TimelinePanel: marker("timeline"),
}));
vi.mock("@/app/(hub)/today/_components/degree-panel", () => ({ DegreePanel: marker("degree") }));
vi.mock("@/app/(hub)/today/_components/due-soon-panel", () => ({
  DueSoonPanel: marker("due-soon"),
}));
vi.mock("@/app/(hub)/today/_components/campus-panel", () => ({ CampusPanel: marker("campus") }));
vi.mock("@/app/(hub)/today/_components/opportunities-panel", () => ({
  OpportunitiesPanel: marker("opportunities"),
}));
vi.mock("@/app/(hub)/today/_components/quick-links", () => ({ QuickLinks: marker("quick-links") }));

const page = await import("@/app/(hub)/today/page");

const props = (id: string) =>
  JSON.parse(screen.getByTestId(id).getAttribute("data-props") ?? "{}") as Record<string, unknown>;

const search = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) });

describe("/today", () => {
  it("is titled Today", () => {
    expect(page.metadata).toEqual({ title: "Today" });
  });

  it("requires a session and renders every panel for the fixtures day", async () => {
    render(await page.default(search({})));
    expect(session.requireUser).toHaveBeenCalled();
    for (const id of [
      "header",
      "actions",
      "timeline",
      "degree",
      "due-soon",
      "campus",
      "opportunities",
      "quick-links",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(props("header")).toMatchObject({
      userId: "u1",
      now: "2026-09-30T16:00:00.000Z",
      timeZone: "America/New_York",
      selected: "2026-09-30",
      stripDays: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"],
      eventsOn: true,
    });
    expect(props("timeline")).toMatchObject({ day: "2026-09-30", eventsOn: true });
    expect(props("opportunities")).toMatchObject({ careersOn: true });
  });

  it("shows another strip day from ?day=, and ignores days outside the strip", async () => {
    render(await page.default(search({ day: "2026-10-01" })));
    expect(props("timeline")).toMatchObject({ day: "2026-10-01" });
    expect(props("header")).toMatchObject({ selected: "2026-10-01" });
  });

  it("ignores a day outside the strip", async () => {
    render(await page.default(search({ day: "2026-12-25" })));
    expect(props("timeline")).toMatchObject({ day: "2026-09-30" });
  });

  it("leaves out This week on campus while events are off, and Careers while careers is off", async () => {
    vi.stubEnv("FEATURE_EVENTS", "false");
    vi.stubEnv("FEATURE_CAREERS", "false");
    render(await page.default(search({})));
    expect(screen.queryByTestId("campus")).toBeNull();
    expect(props("header")).toMatchObject({ eventsOn: false });
    expect(props("timeline")).toMatchObject({ eventsOn: false });
    expect(props("opportunities")).toMatchObject({ careersOn: false });
  });

  it("decides today in ET from the server clock", async () => {
    // 11:30 PM ET on Friday Oct 2 is already Saturday in UTC: still Friday's strip.
    vi.stubEnv("FIXTURES_NOW", "2026-10-02T23:30:00-04:00");
    render(await page.default(search({})));
    expect(props("timeline")).toMatchObject({ day: "2026-10-02" });
    expect((props("header").stripDays as string[])[0]).toBe("2026-09-28");
  });
});
