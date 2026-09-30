import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventList } from "@/app/(hub)/events/_components/event-list";
import { EventSourcesView } from "@/app/(hub)/events/_components/event-sources";
import { EventsFilters } from "@/app/(hub)/events/_components/events-filters";
import { EventsResultsView } from "@/app/(hub)/events/_components/events-results";
import {
  LibraryHoursView,
  listedLocations,
  openState,
} from "@/app/(hub)/events/_components/library-hours";
import type { EventSourceStatus } from "@/app/(hub)/events/_lib/load";
import { DEFAULT_EVENTS_VIEW, type EventsView } from "@/app/(hub)/events/_lib/params";
import { rangeWindow } from "@/app/(hub)/events/_lib/range";
import type { FeedItem, LibraryHours } from "@/lib/types/feeds";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const TZ = "America/New_York";
const NOW = new Date("2026-09-30T12:00:00-04:00");

beforeEach(() => {
  router.push.mockReset();
});

function view(patch: Partial<EventsView> = {}): EventsView {
  return { ...DEFAULT_EVENTS_VIEW, ...patch };
}

const ITEMS: FeedItem[] = [
  {
    id: "rhodes",
    source: "wildcatsync",
    kind: "event",
    title: "Rhodes Scholarship Application Deadlines",
    url: "https://wildcatsync.davidson.edu/rsvp_boot?id=1",
    startsAt: "2026-07-23T16:00:00.000Z",
    endsAt: "2026-10-01T16:00:00.000Z",
    allDay: false,
    location: "Online",
    summaryText: null,
    fetchedAt: "2026-09-30T16:00:00.000Z",
  },
  {
    id: "watson",
    source: "wildcatsync",
    kind: "deadline",
    title: "Watson Fellowship Nomination Application Deadline",
    url: "https://wildcatsync.davidson.edu/rsvp_boot?id=2",
    startsAt: "2026-09-30T19:00:00.000Z",
    endsAt: "2026-09-30T19:01:00.000Z",
    allDay: false,
    location: "Online",
    summaryText: "Nominations close at 3 PM.",
    fetchedAt: "2026-09-30T16:00:00.000Z",
  },
  {
    id: "book-fair",
    source: "library",
    kind: "event",
    title: "Browsing Book Fair",
    url: "https://davidson.libcal.com/event/1",
    startsAt: "2026-10-01T15:00:00.000Z",
    endsAt: "2026-10-01T18:00:00.000Z",
    allDay: false,
    location: "Lilly Family Gallery",
    summaryText: null,
    fetchedAt: "2026-09-30T16:00:00.000Z",
  },
  {
    id: "fall-break",
    source: "events-digest",
    kind: "event",
    title: "Fall Break",
    url: "https://us6.campaign-archive.com/?u=1",
    startsAt: "2026-10-10T04:00:00.000Z",
    endsAt: "2026-10-14T04:00:00.000Z",
    allDay: true,
    location: null,
    summaryText: null,
    fetchedAt: "2026-09-30T16:00:00.000Z",
  },
];

describe("EventList", () => {
  it("groups by ET day, Ongoing first, with headings and counts", () => {
    render(<EventList items={ITEMS} hasMore={false} view={view()} now={NOW} timeZone={TZ} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Ongoing Started before today, 1 item",
      "Today Wednesday, September 30, 1 item",
      "Tomorrow Thursday, October 1, 1 item",
      "Saturday, October 10, 1 item",
    ]);
    expect(screen.getByRole("region", { name: /^Today/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Show more" })).toBeNull();
  });

  it("tags every item with its stored source and links out safely", () => {
    render(<EventList items={ITEMS} hasMore={false} view={view()} now={NOW} timeZone={TZ} />);
    const rows = screen.getAllByTestId("event-item");
    expect(rows).toHaveLength(ITEMS.length);
    rows.forEach((row, index) => {
      const item = ITEMS[index]!;
      expect(row).toHaveAttribute("data-source", item.source);
      const tag = row.querySelector(`[data-source="${item.source}"]:not(li)`);
      expect(tag, item.id).not.toBeNull();
      const link = within(row).getByRole("link", { name: new RegExp(item.title) });
      expect(link).toHaveAttribute("href", item.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAccessibleName(`${item.title} (opens in a new tab)`);
    });
    // The tag's accessible text names the source in words.
    expect(rows[0]!.querySelector("span[data-source]")).toHaveTextContent("Source: WildcatSync");
  });

  it("renders deadlines, all-day and ongoing times", () => {
    render(<EventList items={ITEMS} hasMore={false} view={view()} now={NOW} timeZone={TZ} />);
    const [rhodes, watson, fair, fallBreak] = screen.getAllByTestId("event-item");
    expect(rhodes).toHaveTextContent("Since Jul 23 · until Oct 1, 12:00 PM");
    expect(watson).toHaveTextContent("Due 3:00 PM");
    expect(watson).toHaveAttribute("data-kind", "deadline");
    expect(within(watson!).getByText("Deadline")).toBeInTheDocument();
    expect(watson).toHaveTextContent("Nominations close at 3 PM.");
    expect(fair).toHaveTextContent("11:00 AM – 2:00 PM");
    expect(fair).toHaveTextContent("Lilly Family Gallery");
    expect(fallBreak).toHaveTextContent("All day, through Oct 13");
  });

  it("offers Show more (50 more) while hasMore, and says when the page is full", () => {
    const { rerender } = render(
      <EventList items={ITEMS} hasMore view={view({ range: "week" })} now={NOW} timeZone={TZ} />,
    );
    expect(screen.getByRole("link", { name: "Show more" })).toHaveAttribute(
      "href",
      "/events?range=week&limit=100",
    );
    rerender(
      <EventList items={ITEMS} hasMore view={view({ limit: 500 })} now={NOW} timeZone={TZ} />,
    );
    expect(screen.queryByRole("link", { name: "Show more" })).toBeNull();
    expect(screen.getByText(/Narrow the dates or the filters/)).toBeInTheDocument();
  });
});

describe("EventsResultsView", () => {
  const window = rangeWindow("14d", NOW, TZ);
  const synced: EventSourceStatus[] = ["wildcatsync", "hurt-hub", "library", "events-digest"].map(
    (id) => ({ id, lastSync: "2026-09-30T16:00:00.000Z", status: "ok" }) as EventSourceStatus,
  );
  const never = synced.map((row) => ({ ...row, lastSync: null, status: "never" as const }));

  function show(v: EventsView, items: FeedItem[], statuses: EventSourceStatus[] | null) {
    return render(
      <EventsResultsView
        view={v}
        window={rangeWindow(v.range, NOW, TZ)}
        now={NOW}
        timeZone={TZ}
        result={{ items, hasMore: false }}
        statuses={statuses}
      />,
    );
  }

  it("announces a summary of the results", () => {
    show(view(), ITEMS, synced);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Next 14 days: 4 items, through Tuesday, Oct 13.",
    );
    expect(window.lastDay).toBe("2026-10-13");
  });

  it("says when the calendars have not synced yet", () => {
    show(view(), [], never);
    expect(
      screen.getByRole("heading", { name: "The campus calendars have not synced yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reload" })).toHaveAttribute("href", "/events");
    expect(screen.getByRole("list", { name: "Calendars MakeItSo reads" })).toBeInTheDocument();
  });

  it("only counts the requested sources for not-synced-yet", () => {
    show(view({ sources: ["library"] }), [], [...synced.slice(0, 2), never[2]!, synced[3]!]);
    expect(screen.getByRole("heading", { name: /not synced yet/ })).toBeInTheDocument();
  });

  it("explains an empty list with and without filters", () => {
    const { unmount } = show(view({ kinds: ["deadline"], range: "today" }), [], synced);
    expect(
      screen.getByRole("heading", { name: "Nothing matches these filters" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/events?range=today",
    );
    expect(screen.getByRole("link", { name: "Show the next 14 days" })).toHaveAttribute(
      "href",
      "/events?kinds=deadline",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Today: No items today.");
    unmount();
    show(view(), [], null);
    expect(
      screen.getByRole("heading", { name: "Nothing on the campus calendars" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("EventsFilters", () => {
  it("shows the view as checked chips inside a GET form", () => {
    render(
      <EventsFilters
        view={view({ range: "week", sources: ["library"], kinds: ["event"], q: "zen" })}
      />,
    );
    const form = screen.getByRole("form", { name: "Filter events" });
    expect(form).toHaveAttribute("action", "/events");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("radio", { name: "This week" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Today" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Library" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "WildcatSync" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Events" })).toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search events" })).toHaveValue("zen");
    expect(screen.getByRole("group", { name: "Sources" })).toHaveAccessibleDescription(
      "Showing only the checked sources.",
    );
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/events?range=week",
    );
  });

  it("navigates as soon as a filter changes, back to the first page", async () => {
    render(<EventsFilters view={view({ limit: 150 })} />);
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Deadlines" }));
    expect(router.push).toHaveBeenLastCalledWith("/events?kinds=deadline", { scroll: false });
    await userEvent.click(screen.getByRole("checkbox", { name: "Hurt Hub" }));
    expect(router.push).toHaveBeenLastCalledWith("/events?sources=hurt-hub&kinds=deadline", {
      scroll: false,
    });
    await userEvent.click(screen.getByRole("radio", { name: "Today" }));
    expect(router.push).toHaveBeenLastCalledWith(
      "/events?sources=hurt-hub&kinds=deadline&range=today",
      { scroll: false },
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Deadlines" }));
    expect(router.push).toHaveBeenLastCalledWith("/events?sources=hurt-hub&range=today", {
      scroll: false,
    });
  });

  it("searches on Enter and with the button", async () => {
    render(<EventsFilters view={view()} />);
    const box = screen.getByRole("searchbox", { name: "Search events" });
    await userEvent.type(box, "  book   fair {Enter}");
    expect(router.push).toHaveBeenLastCalledWith("/events?q=book+fair", { scroll: false });
    await userEvent.clear(box);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(router.push).toHaveBeenLastCalledWith("/events", { scroll: false });
  });

  it("follows a navigation that did not come from the form", () => {
    const { rerender } = render(<EventsFilters view={view({ sources: ["library"], q: "zen" })} />);
    rerender(<EventsFilters view={view()} />);
    expect(screen.getByRole("checkbox", { name: "Library" })).not.toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search events" })).toHaveValue("");
    expect(screen.getByRole("group", { name: "Sources" })).toHaveAccessibleDescription(
      "Showing every source.",
    );
  });
});

const HOURS: LibraryHours = {
  date: "2026-09-30",
  fetchedAt: "2026-09-30T16:00:00.000Z",
  locations: [
    {
      id: "1",
      name: "E.H. Little Library",
      status: "text",
      text: "Closed for Renovation",
      opensAt: null,
      closesAt: null,
    },
    {
      id: "2",
      name: "Chambers Building",
      status: "not-set",
      text: "",
      opensAt: null,
      closesAt: null,
    },
    {
      id: "3",
      name: "Lilly Family Gallery",
      status: "24hours",
      text: "24 Hours",
      opensAt: "2026-09-30T04:00:00.000Z",
      closesAt: "2026-10-01T04:00:00.000Z",
    },
    {
      id: "4",
      name: "Music Library (Sloan 101)",
      status: "open",
      text: "7am - 11:59pm",
      opensAt: "2026-09-30T11:00:00.000Z",
      closesAt: "2026-10-01T03:59:00.000Z",
    },
    { id: "5", name: "Archives", status: "closed", text: "Closed", opensAt: null, closesAt: null },
  ],
};

describe("library hours", () => {
  it("works out open now from LibCal's times", () => {
    const [text, , allDay, music, closed] = HOURS.locations;
    expect(openState(text!, NOW)).toBe("info");
    expect(openState(allDay!, NOW)).toBe("open-now");
    expect(openState(music!, NOW)).toBe("open-now");
    expect(openState(music!, new Date("2026-09-30T06:30:00-04:00"))).toBe("closed-now");
    expect(openState(closed!, NOW)).toBe("closed");
    expect(openState({ ...music!, opensAt: null }, NOW)).toBe("info");
    expect(listedLocations(HOURS).map((l) => l.id)).toEqual(["1", "3", "4", "5"]);
  });

  it("lists the locations with hours, the source and when it was read", () => {
    render(
      <LibraryHoursView
        today="2026-09-30"
        now={NOW}
        timeZone={TZ}
        result={{ ok: true, hours: HOURS }}
      />,
    );
    const card = screen.getByRole("region", { name: /Library hours/ });
    const rows = within(within(card).getByTestId("library-hours")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "E.H. Little LibraryClosed for Renovation",
      "Lilly Family Gallery24 HoursOpen now",
      "Music Library (Sloan 101)7am - 11:59pmOpen now",
      "ArchivesClosed",
    ]);
    expect(within(card).getByText("Library", { selector: "[data-source]" })).toHaveAttribute(
      "data-source",
      "library",
    );
    expect(card).toHaveTextContent("as of Sep 30, 12:00 PM");
    const site = within(card).getByRole("link", { name: /Library website/ });
    expect(site).toHaveAttribute("rel", "noopener noreferrer");
    expect(site.getAttribute("href")).toMatch(/^https:\/\//);
  });

  it("says when the hours are unavailable or empty", () => {
    const { unmount } = render(
      <LibraryHoursView
        today="2026-09-30"
        now={NOW}
        timeZone={TZ}
        result={{ ok: false, reason: "unavailable" }}
      />,
    );
    expect(screen.getByTestId("library-hours-unavailable")).toHaveTextContent(
      "Library hours are unavailable right now.",
    );
    unmount();
    render(
      <LibraryHoursView
        today="2026-09-30"
        now={NOW}
        timeZone={TZ}
        result={{ ok: true, hours: { ...HOURS, locations: [HOURS.locations[1]!] } }}
      />,
    );
    expect(screen.getByText("LibCal lists no hours for today.")).toBeInTheDocument();
  });
});

describe("EventSourcesView", () => {
  it("shows each calendar's last sync, or why there is none", () => {
    render(
      <EventSourcesView
        timeZone={TZ}
        statuses={[
          { id: "wildcatsync", lastSync: "2026-09-30T16:00:00.000Z", status: "ok" },
          { id: "hurt-hub", lastSync: "2026-09-30T09:00:00.000Z", status: "stale" },
          { id: "library", lastSync: "2026-09-30T15:00:00.000Z", status: "error" },
          { id: "events-digest", lastSync: null, status: "never" },
        ]}
      />,
    );
    // No "sources" in the name: that belongs to the shell's Sources panel (landmark names stay distinct).
    expect(screen.getByRole("region", { name: "Calendars" })).toBeInTheDocument();
    const rows = within(screen.getByTestId("event-sources")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Source: WildcatSyncas of Sep 30, 12:00 PM",
      "Source: Hurt Hubas of Sep 30, 5:00 AM · out of date",
      "Source: Libraryas of Sep 30, 11:00 AM · the latest check failed",
      "Source: Events DigestNot synced yet",
    ]);
  });

  it("degrades when the sync times cannot be read", () => {
    render(<EventSourcesView timeZone={TZ} statuses={null} />);
    expect(screen.getByText("Sync times are unavailable right now.")).toBeInTheDocument();
  });
});
