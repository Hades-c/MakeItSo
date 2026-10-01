import { render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCES, type SourceId } from "@/lib/sources";
import type { ResolvedTerms } from "@/lib/types/catalog";
import type { FeedItem } from "@/lib/types/feeds";
import type { DaySchedule, PlanProgress, PlanView, StudentDeadline } from "@/lib/types/plan";
import type { ProfileView } from "@/server/auth/profile";
import type { Loaded } from "@/server/today/load";

/**
 * The /today panels rendered from server data (the loaders are replaced by fixtures-day values here; the loaders
 * themselves are covered by today-service.test.ts): the h1 day summary and strip, the timeline and its empty
 * states, Due soon, degree progress, This week on campus, Opportunities, quick links, the Plan Spring 2027 call to
 * action and the onboarding nudge. Every aggregated item must carry the tag of its stored source, and every
 * panel must degrade to its small error state on its own.
 */

const NOON = new Date("2026-09-30T12:00:00-04:00");
const TZ = "America/New_York";
const USER = "64b7f0a1c2d3e4f5a6b7c8d9";

function entry(
  code: string,
  crn: string,
  start: string,
  end: string,
  room: string,
  day = "2026-09-30",
) {
  return {
    crn,
    courseCode: code,
    title: `${code} title`,
    kind: "class" as const,
    start,
    end,
    startsAt: new Date(`${day}T${start}:00-04:00`).toISOString(),
    endsAt: new Date(`${day}T${end}:00-04:00`).toISOString(),
    building: "Watson Life Sciences Building",
    room,
  };
}

function schedule(day: string, over: Partial<DaySchedule> = {}): DaySchedule {
  const mwf = ["2026-09-28", "2026-09-30", "2026-10-02"].includes(day);
  const mw = ["2026-09-28", "2026-09-30"].includes(day);
  const entries = [
    ...(mwf
      ? [
          entry("CSC 221", "10144", "10:30", "11:20", "132", day),
          entry("ECO 232", "10181", "11:30", "12:20", "243", day),
        ]
      : []),
    ...(mw ? [entry("ENV 237", "10230", "14:30", "15:45", "247", day)] : []),
  ];
  const weekend = ["2026-10-03", "2026-10-04"].includes(day);
  return {
    date: day,
    termCode: "202601",
    entries,
    tba: [],
    empty: entries.length > 0 ? null : weekend ? "weekend" : "no-classes-today",
    ...over,
  };
}

const PROFILE = {
  id: USER,
  name: "Taylor Student",
  email: "tstudent@davidson.edu",
  emailVerifiedAt: null,
  davidson: true,
  majors: [],
  minors: [],
  graduationYear: 2030,
  firstTerm: "202601",
  standingOverride: null,
  interests: [],
  aiConsentAt: null,
  adultAttestedAt: null,
  onboardedAt: "2026-09-01T12:00:00.000Z",
  createdAt: "2026-09-01T12:00:00.000Z",
  standing: { standing: "first-year", estimated: true },
} satisfies ProfileView;

const DEADLINE: StudentDeadline = {
  id: "64b7f0a1c2d3e4f5a6b7c8d0",
  title: "Problem set",
  courseCode: "CSC 221",
  dueAt: "2026-10-01T23:59:00-04:00",
};

function plan(over: Partial<PlanView> = {}): PlanView {
  const item = (courseCode: string, termCode: string, status: "in-progress" | "planned") => ({
    id: "64b7f0a1c2d3e4f5a6b7c8d1",
    termCode,
    courseCode,
    canonicalCode: courseCode,
    title: courseCode,
    credits: 1,
    status,
    passFail: false,
    source: "catalog" as const,
    reqCodes: null,
    unverified: false,
  });
  return {
    items: [
      item("CSC 221", "202601", "in-progress"),
      item("ECO 232", "202601", "in-progress"),
      item("ENV 237", "202601", "in-progress"),
      item("HIS 357", "202602", "planned"),
    ],
    summer: [],
    deadlines: [DEADLINE],
    manual: { languageExempt: false, pe: { lifetimeActivities: 0, teamSport: false } },
    legacy: false,
    updatedAt: null,
    ...over,
  };
}

const TERMS: ResolvedTerms = {
  terms: [],
  current: "202601",
  registration: "202602",
  asOf: null,
};

const PROGRESS = {
  creditsDone: 0,
  creditsPlanned: 4,
  required: 32,
  reqs: {},
  filledBy: {},
  warnings: [],
} as unknown as PlanProgress;

function feed(
  id: string,
  start: string,
  end: string | null,
  over: Partial<FeedItem> = {},
): FeedItem {
  return {
    id,
    source: "wildcatsync",
    kind: "event",
    title: `Campus event ${id}`,
    url: `https://davidson.campuslabs.com/engage/event/${id}`,
    startsAt: new Date(start).toISOString(),
    endsAt: end ? new Date(end).toISOString() : null,
    allDay: false,
    location: "Alvarez Student Union",
    summaryText: null,
    fetchedAt: "2026-09-30T13:00:00.000Z",
    ...over,
  };
}

const FEEDS: FeedItem[] = [
  feed("1", "2026-09-30T19:00:00-04:00", "2026-09-30T20:00:00-04:00"),
  feed("2", "2026-10-01T16:00:00-04:00", "2026-10-01T17:00:00-04:00", { source: "hurt-hub" }),
];

const ok = <T,>(value: T): Loaded<T> => ({ ok: true, value });
const FAIL = { ok: false } as const;

const state = vi.hoisted(() => ({
  profile: null as unknown,
  terms: null as unknown,
  plan: null as unknown,
  progress: null as unknown,
  schedule: null as unknown as (day: string) => unknown,
  feeds: null as unknown,
  campus: null as unknown,
}));

vi.mock("@/server/today/load", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadProfile: async () => state.profile,
  loadTerms: async () => state.terms,
  loadPlan: async () => state.plan,
  loadProgress: async () => state.progress,
  loadSchedule: async (_user: string, day: string) => state.schedule(day),
  loadFeedItems: async () => state.feeds,
  loadCampusEvents: async () => state.campus,
}));

const { TodayHeader } = await import("@/app/(hub)/today/_components/today-header");
const { TimelinePanel } = await import("@/app/(hub)/today/_components/timeline-panel");
const { DueSoonPanel } = await import("@/app/(hub)/today/_components/due-soon-panel");
const { DegreePanel } = await import("@/app/(hub)/today/_components/degree-panel");
const { CampusPanel } = await import("@/app/(hub)/today/_components/campus-panel");
const { OpportunitiesPanel } = await import("@/app/(hub)/today/_components/opportunities-panel");
const { QuickLinks } = await import("@/app/(hub)/today/_components/quick-links");
const { TodayActions } = await import("@/app/(hub)/today/_components/today-actions");
const { stripDays } = await import("@/server/today/time");
const { buildDueSoon, dueSoonRange } = await import("@/server/today/due-soon");
const { deadlinesBetween } = await import("@/server/content/deadlines");

const DAYS = stripDays("2026-09-30");

beforeEach(() => {
  state.profile = ok(PROFILE);
  state.terms = ok(TERMS);
  state.plan = ok(plan());
  state.progress = ok(PROGRESS);
  state.schedule = (day: string) => ok(schedule(day));
  state.feeds = ok(FEEDS);
  state.campus = ok(FEEDS);
});

/** Every element marked data-aggregated holds a SourceTag of that source ("Source: <label>"). */
function expectAllTagged(container: HTMLElement): number {
  const items = [...container.querySelectorAll<HTMLElement>("[data-aggregated]")];
  const problems = items.flatMap((item) => {
    const source = item.dataset.aggregated as SourceId;
    if (!(source in SOURCES)) return [`unknown source ${source}`];
    const tag = item.querySelector(`[data-source="${source}"]`);
    return tag?.textContent === `Source: ${SOURCES[source].label}`
      ? []
      : [`${source}: ${item.textContent?.slice(0, 40)}`];
  });
  expect(problems).toEqual([]);
  return items.length;
}

async function show(node: Promise<React.ReactElement> | React.ReactElement) {
  return render(await node);
}

describe("the header", () => {
  const header = (selected = "2026-09-30", eventsOn = true) =>
    TodayHeader({ userId: USER, now: NOON, timeZone: TZ, stripDays: DAYS, selected, eventsOn });

  it("is the day summary as the h1, with the date, the term, counts and the strip", async () => {
    await show(header("2026-09-30", false));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "You're in ECO 232 until 12:20 PM, then one more class, and Problem set (CSC 221) is due tomorrow at 11:59 PM.",
    );
    expect(screen.getByText("Wednesday, September 30")).toHaveAttribute("dateTime", "2026-09-30");
    expect(screen.getByText(/· Fall 2026/)).toBeVisible();
    // Deadlines for the student: the WebTree window, the office programs open to all, their own (not the
    // seniors' minor declaration).
    const { from, to } = dueSoonRange(NOON);
    const forYou = buildDueSoon({
      now: NOON,
      standing: "first-year",
      contentDeadlines: deadlinesBetween(from, to),
      studentDeadlines: [DEADLINE],
    }).filter((item) => item.forYou);
    expect(forYou.length).toBeGreaterThan(2);
    expect(screen.getByTestId("day-counts")).toHaveTextContent(
      `3 classes today · ${forYou.length} deadlines in the next two weeks`,
    );
    const strip = screen.getByRole("navigation", { name: "This school week" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/today?day=2026-09-28",
      "/today?day=2026-09-29",
      "/today",
      "/today?day=2026-10-01",
      "/today?day=2026-10-02",
    ]);
    expect(links[2]).toHaveAttribute("aria-current", "page");
    expect(links[2]).toHaveTextContent(
      "Wednesday, September 30: 3 classes and deadlines, today, shown",
    );
    expect(links[3]).toHaveTextContent("Thursday, October 1: 1 class or deadline");
  });

  it("adds tonight's campus event while events are on", async () => {
    state.plan = ok(plan({ deadlines: [] }));
    await show(header("2026-09-30", true));
    expect(screen.getByTestId("day-summary")).toHaveTextContent(
      "You're in ECO 232 until 12:20 PM, then one more class, and Campus event 1 is at 7:00 PM.",
    );
  });

  it("marks another day shown in the strip", async () => {
    await show(header("2026-10-01"));
    const strip = screen.getByRole("navigation", { name: "This school week" });
    expect(within(strip).getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/today?day=2026-10-01",
    );
    expect(within(strip).getByRole("link", { current: "date" })).toHaveAttribute("href", "/today");
  });

  it("still has a headline when the schedule and profile fail", async () => {
    state.schedule = () => FAIL;
    state.profile = FAIL;
    state.feeds = FAIL;
    await show(header());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Problem set (CSC 221) is due tomorrow at 11:59 PM.",
    );
  });

  it("asks a student who has not finished setup to do so", async () => {
    state.profile = ok({ ...PROFILE, onboardedAt: null });
    state.plan = ok(plan({ deadlines: [] }));
    await show(header("2026-09-30", false));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Finish setting up MakeItSo to see your classes, deadlines and campus events here.",
    );
  });
});

describe("the timeline", () => {
  const panel = (day = "2026-09-30", eventsOn = true) =>
    TimelinePanel({ userId: USER, now: NOON, timeZone: TZ, day, stripDays: DAYS, eventsOn });

  it("draws today's classes with the now-line, the deadline-free view and the next class day", async () => {
    await show(panel("2026-09-30", false));
    const card = screen.getByRole("region", { name: /^Today/ });
    expect(within(card).getByText("9a–4p")).toBeVisible();
    const timeline = within(card).getByTestId("day-timeline");
    expect(within(timeline).getByTestId("now-line")).toBeInTheDocument();
    const classes = timeline.querySelectorAll('[data-kind="class"]');
    expect(classes).toHaveLength(3);
    expect(timeline).toHaveTextContent("Watson Life Sciences Building 132");
    // Thursday has no class: next up is Friday's first.
    expect(card).toHaveTextContent(
      "Fri 10:30 AM · CSC 221 title · Watson Life Sciences Building 132",
    );
  });

  it("adds tonight's campus event with its tag while events are on", async () => {
    await show(panel());
    const event = document.querySelector('[data-kind="event"]');
    expect(event).toHaveAttribute("data-source", "wildcatsync");
    expect(event).toHaveTextContent("Campus event 1");
    expect(event?.querySelector('[data-source="wildcatsync"]')).toHaveTextContent(
      "Source: WildcatSync",
    );
  });

  it("shows another strip day without a now-line, with a way back", async () => {
    await show(panel("2026-10-01"));
    const card = screen.getByRole("region", { name: /^Thursday, October 1/ });
    expect(within(card).queryByTestId("now-line")).toBeNull();
    expect(within(card).getByRole("link", { name: "Back to today" })).toHaveAttribute(
      "href",
      "/today",
    );
    // Thursday: no classes, the student's 11:59 PM deadline and the Hurt Hub event.
    expect(card.querySelector('[data-kind="deadline"]')).toHaveTextContent("Problem set");
    expect(card.querySelector('[data-kind="event"]')).toHaveAttribute("data-source", "hurt-hub");
  });

  it.each([
    ["weekend", "No classes on the weekend."],
    ["break", "No classes today: Fall Break."],
    ["no-term", "No term is in session."],
    ["no-classes-today", "No classes today."],
  ] as const)("says why a %s day is empty", async (empty, text) => {
    state.plan = ok(plan({ deadlines: [] }));
    state.schedule = (day: string) =>
      ok(
        schedule(day, { entries: [], empty, ...(empty === "break" ? { date: "2026-09-21" } : {}) }),
      );
    await show(panel("2026-09-30", false));
    expect(screen.getByTestId("timeline-empty")).toHaveTextContent(text);
  });

  it("asks for sections when none are chosen", async () => {
    state.plan = ok(plan({ deadlines: [] }));
    state.schedule = (day: string) => ok(schedule(day, { entries: [], empty: "no-sections" }));
    await show(panel("2026-09-30", false));
    expect(screen.getByTestId("timeline-empty")).toHaveTextContent(
      "No Fall 2026 class sections in your plan yet.",
    );
    expect(screen.getByRole("link", { name: "Open my plan" })).toHaveAttribute(
      "href",
      "/plan?tab=four-year",
    );
  });

  it("still asks for sections when campus events fill the view", async () => {
    state.plan = ok(plan({ deadlines: [] }));
    state.schedule = (day: string) => ok(schedule(day, { entries: [], empty: "no-sections" }));
    await show(panel("2026-09-30", true));
    expect(screen.getByTestId("day-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-empty")).toHaveTextContent(
      "No Fall 2026 class sections in your plan yet.",
    );
    expect(screen.getByRole("link", { name: "Open my plan" })).toHaveAttribute(
      "href",
      "/plan?tab=four-year",
    );
  });

  it("lists sections without a meeting time", async () => {
    state.schedule = (day: string) =>
      ok(schedule(day, { tba: [{ crn: "10753", courseCode: "ANT 498", title: "Honors Thesis" }] }));
    await show(panel("2026-09-30", false));
    expect(screen.getByTestId("timeline-tba")).toHaveTextContent("Time TBA: ANT 498 Honors Thesis");
  });

  it("degrades to a small error state", async () => {
    state.schedule = () => FAIL;
    await show(panel());
    expect(screen.getByTestId("panel-error")).toHaveTextContent("Your schedule could not load");
  });
});

describe("Due soon", () => {
  it("lists the calendar, the programs and the student's deadline, each tagged and linked", async () => {
    const { container } = await show(DueSoonPanel({ userId: USER, now: NOON }));
    const card = screen.getByRole("region", { name: /^Due soon/ });
    const items = within(card).getAllByTestId("due-soon-item");
    expect(items.length).toBeGreaterThan(3);
    expect(expectAllTagged(container)).toBe(items.length);
    const own = items.find((li) => li.dataset.kind === "student");
    expect(own).toHaveTextContent("Problem set");
    expect(own).toHaveTextContent("Tomorrow 11:59p");
    expect(own).toHaveTextContent("Source: Your plan");
    const webtree = items.find((li) => li.textContent?.includes("WebTree Open"));
    expect(webtree).toHaveTextContent("Oct 12 – Nov 3");
    expect(webtree?.dataset.aggregated).toBe("registrar");
    const minor = items.find((li) => li.textContent?.includes("Minor Declaration"));
    expect(minor).toHaveTextContent("For: Seniors (Class of 2027)");
    for (const link of within(card).getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("degrades to a small error state", async () => {
    state.plan = FAIL;
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    expect(screen.getByTestId("panel-error")).toHaveTextContent("Your deadlines could not load");
  });
});

describe("degree progress", () => {
  it("shows credits of 32 and the compact map, unofficially", async () => {
    const { container } = await show(DegreePanel({ userId: USER }));
    const card = screen.getByRole("region", { name: /Degree progress/ });
    expect(within(card).getByTestId("credits-done")).toHaveTextContent("0");
    expect(card).toHaveTextContent("of 32 credits done");
    expect(card).toHaveTextContent("4 more credits in progress or planned.");
    expect(card).toHaveTextContent("Unofficial — verify in Degree Works");
    expect(
      within(card).getByRole("img", {
        name: /Your four-year plan: 0 done, 3 in progress, 1 planned of 32 credits/,
      }),
    ).toBeVisible();
    expect(within(card).getByRole("link", { name: "My plan" })).toHaveAttribute(
      "href",
      "/plan?tab=four-year",
    );
    expect(expectAllTagged(container)).toBe(1);
  });

  it("degrades to a small error state", async () => {
    state.progress = FAIL;
    await show(DegreePanel({ userId: USER }));
    expect(screen.getByTestId("panel-error")).toHaveTextContent(
      "Your degree progress could not load",
    );
  });
});

describe("this week on campus", () => {
  it("lists the next events with their tags and links", async () => {
    const { container } = await show(CampusPanel({ now: NOON, timeZone: TZ }));
    const items = screen.getAllByTestId("campus-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Today, 7:00 PM · Alvarez Student Union");
    expect(items[1]).toHaveTextContent("Thursday, October 1, 4:00 PM");
    expect(expectAllTagged(container)).toBe(2);
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
  });

  it("says so when nothing is on, and degrades on failure", async () => {
    state.campus = ok([]);
    await show(CampusPanel({ now: NOON, timeZone: TZ }));
    expect(
      screen.getByText("Nothing on the campus calendars in the next seven days."),
    ).toBeVisible();
    state.campus = FAIL;
    await show(CampusPanel({ now: NOON, timeZone: TZ }));
    expect(screen.getByTestId("panel-error")).toHaveTextContent("Campus events could not load");
  });
});

describe("opportunities and quick links", () => {
  it("lists curated programs after the Due soon window and the Handshake entry point", async () => {
    const { container } = render(OpportunitiesPanel({ now: NOON, careersOn: true }));
    const items = screen.getAllByTestId("opportunity-item");
    expect(items.length).toBeGreaterThan(1);
    expect(expectAllTagged(container)).toBe(items.length);
    const handshake = items[items.length - 1];
    expect(handshake).toHaveAttribute("data-aggregated", "handshake");
    expect(within(handshake!).getByRole("link")).toHaveAttribute(
      "href",
      "https://davidson.joinhandshake.com/",
    );
    expect(screen.getByRole("link", { name: "Careers" })).toHaveAttribute("href", "/careers");
  });

  it("leaves out the Careers link while careers is off", () => {
    render(OpportunitiesPanel({ now: NOON, careersOn: false }));
    expect(screen.queryByRole("link", { name: "Careers" })).toBeNull();
  });

  it("links the portals, tagging the platforms", () => {
    const { container } = render(QuickLinks());
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(8);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(expectAllTagged(container)).toBe(2);
  });
});

describe("the action row", () => {
  it("offers Plan Spring 2027 two weeks before WebTree opens, with its dates and tag", async () => {
    const { container } = await show(TodayActions({ userId: USER, now: NOON, timeZone: TZ }));
    expect(screen.getByRole("link", { name: "Plan Spring 2027" })).toHaveAttribute(
      "href",
      "/plan?tab=next",
    );
    expect(screen.getByTestId("webtree-window")).toHaveTextContent(
      "WebTree opens Mon, Oct 12 at 7:00 AM for Spring 2027 course preferences.",
    );
    expect(expectAllTagged(container)).toBe(1);
    expect(screen.getByRole("link", { name: "Browse courses" })).toHaveAttribute(
      "href",
      "/courses",
    );
    expect(screen.queryByTestId("onboarding-nudge")).toBeNull();
  });

  it("says until when WebTree is open", async () => {
    await show(
      TodayActions({ userId: USER, now: new Date("2026-10-20T12:00:00-04:00"), timeZone: TZ }),
    );
    expect(screen.getByTestId("webtree-window")).toHaveTextContent(
      "WebTree is open for Spring 2027 course preferences until Tue, Nov 3 at 5:00 PM.",
    );
  });

  it("hides the call to action outside the window, and when the terms cannot load", async () => {
    await show(
      TodayActions({ userId: USER, now: new Date("2026-12-01T12:00:00-05:00"), timeZone: TZ }),
    );
    expect(screen.queryByTestId("plan-next-cta")).toBeNull();
    state.terms = FAIL;
    await show(TodayActions({ userId: USER, now: NOON, timeZone: TZ }));
    expect(screen.queryByTestId("plan-next-cta")).toBeNull();
  });

  it("nudges to /onboarding until setup is done", async () => {
    state.profile = ok({ ...PROFILE, onboardedAt: null });
    await show(TodayActions({ userId: USER, now: NOON, timeZone: TZ }));
    const nudge = screen.getByTestId("onboarding-nudge");
    expect(
      within(nudge).getByRole("heading", { name: "Finish setting up MakeItSo" }),
    ).toBeVisible();
    expect(within(nudge).getByRole("link", { name: "Set up my plan" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });
});
