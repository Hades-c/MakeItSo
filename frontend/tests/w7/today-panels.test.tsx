import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedTerms } from "@/lib/types/catalog";
import type { FeedItem } from "@/lib/types/feeds";
import type { DaySchedule, PlanView, StudentDeadline } from "@/lib/types/plan";
import type { ProfileView } from "@/server/auth/profile";
import type * as LoadModule from "@/server/today/load";
import type { Loaded } from "@/server/today/load";

/**
 * The /today panels rendered from server data (the loaders are replaced by fixtures-day values here; the loaders
 * themselves are covered by today-service.test.ts): the fixed h1 and strip, the timeline and its empty states,
 * Due soon (All/Classes), This week on campus, Opportunities, quick links and the onboarding nudge. Every panel
 * must degrade to its small error state on its own.
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
  goals: [],
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
  schedule: null as unknown as (day: string) => unknown,
  feeds: null as unknown,
  campus: null as unknown,
  /** Make the curated-deadlines read throw (a pure computation failing inside a panel). */
  curatedThrows: false,
  /** The student's syllabi and Moodle connection (Due for you's pointer to /syllabi). */
  syllabi: 0,
  moodle: false,
}));

vi.mock("@/server/syllabi", () => ({ countSyllabi: async () => state.syllabi }));
vi.mock("@/server/moodle", () => ({ isMoodleConnected: async () => state.moodle }));

vi.mock("@/server/today/load", async (importOriginal) => {
  const original = await importOriginal<typeof LoadModule>();
  return {
    ...original,
    contentDeadlines: (from: string, to: string) => {
      if (state.curatedThrows) throw new Error("bad curated row");
      return original.contentDeadlines(from, to);
    },
    loadProfile: async () => state.profile,
    loadTerms: async () => state.terms,
    loadPlan: async () => state.plan,
    loadSchedule: async (_user: string, day: string) => state.schedule(day),
    loadFeedItems: async () => state.feeds,
    loadCampusEvents: async () => state.campus,
  };
});

const { TodayHeader } = await import("@/app/(hub)/today/_components/today-header");
const { TimelinePanel } = await import("@/app/(hub)/today/_components/timeline-panel");
const { DueSoonPanel } = await import("@/app/(hub)/today/_components/due-soon-panel");
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
  state.schedule = (day: string) => ok(schedule(day));
  state.feeds = ok(FEEDS);
  state.campus = ok(FEEDS);
  state.curatedThrows = false;
  state.syllabi = 0;
  state.moodle = false;
});

async function show(node: Promise<React.ReactElement | null> | React.ReactElement | null) {
  return render(await node);
}

describe("the header", () => {
  const header = (selected = "2026-09-30") =>
    TodayHeader({ userId: USER, now: NOON, timeZone: TZ, stripDays: DAYS, selected });

  it("is a fixed headline, with the date, the term and the strip", async () => {
    await show(header());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your day at Davidson");
    expect(screen.getByText("Wednesday, September 30")).toHaveAttribute("dateTime", "2026-09-30");
    expect(screen.getByText(/· Fall 2026/)).toBeVisible();
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

  it("marks another day shown in the strip", async () => {
    await show(header("2026-10-01"));
    const strip = screen.getByRole("navigation", { name: "This school week" });
    expect(within(strip).getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/today?day=2026-10-01",
    );
    expect(within(strip).getByRole("link", { current: "date" })).toHaveAttribute("href", "/today");
  });

  it("says how many are due for the student, linking the card, outside the WebTree window", async () => {
    await show(header());
    const line = screen.getByTestId("due-for-you-line");
    expect(line).toHaveTextContent(/^\d+ due for you in the next two weeks$/);
    expect(line).toHaveAttribute("href", "#due-soon");
    expect(screen.queryByTestId("webtree-window")).toBeNull();
  });

  it("is the WebTree window, with Plan Spring 2027, while WebTree is open", async () => {
    await show(
      TodayHeader({
        userId: USER,
        now: new Date("2026-10-20T12:00:00-04:00"),
        timeZone: TZ,
        stripDays: DAYS,
        selected: "2026-09-30",
      }),
    );
    expect(screen.getByTestId("webtree-window")).toHaveTextContent(
      "WebTree is open for Spring 2027 course preferences until Tue, Nov 3 at 5:00 PM. · Plan Spring 2027",
    );
    expect(screen.getByRole("link", { name: "Plan Spring 2027" })).toHaveAttribute(
      "href",
      "/plan?tab=next",
    );
    // A text link, never a second red button.
    expect(screen.getByRole("link", { name: "Plan Spring 2027" })).not.toHaveClass(
      "bg-primary-fill",
    );
    expect(screen.queryByTestId("due-for-you-line")).toBeNull();
  });

  it("leaves the line out when the terms and the deadlines cannot load", async () => {
    state.terms = FAIL;
    state.curatedThrows = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await show(
      TodayHeader({
        userId: USER,
        now: new Date("2026-10-20T12:00:00-04:00"),
        timeZone: TZ,
        stripDays: DAYS,
        selected: "2026-09-30",
      }),
    );
    expect(screen.queryByTestId("webtree-window")).toBeNull();
    expect(screen.queryByTestId("due-for-you-line")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your day at Davidson");
    log.mockRestore();
  });

  it("still shows the headline when the schedule and profile fail", async () => {
    state.schedule = () => FAIL;
    state.profile = FAIL;
    await show(header());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your day at Davidson");
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

  it("adds tonight's campus event while events are on, and says the timeline's sources once", async () => {
    await show(panel());
    const event = document.querySelector('[data-kind="event"]');
    expect(event).toHaveTextContent("Campus event 1");
    // No label on the block (no room); its source for screen readers, and in the one line under the timeline.
    expect(event).toHaveAttribute("data-source", "wildcatsync");
    expect(event).toHaveTextContent("Source: WildcatSync");
    expect(screen.getByTestId("timeline-sources")).toHaveTextContent(
      "Sources: the course schedule and WildcatSync",
    );
    expect(screen.getByTestId("day-timeline")).toHaveAttribute(
      "data-provenance",
      "course-schedule wildcatsync",
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

  it("says next up from the real today: nothing for a past day, never 'Tomorrow' two days out", async () => {
    // Monday (already past on Wednesday): no next-up line pointing at Tuesday.
    await show(panel("2026-09-28", false));
    expect(screen.getByRole("region", { name: /^Monday, September 28/ })).not.toHaveTextContent(
      /Tomorrow|Tue /,
    );
    document.body.innerHTML = "";
    // Thursday: Friday is two days from today, so its weekday, not "Tomorrow".
    await show(panel("2026-10-01", false));
    const card = screen.getByRole("region", { name: /^Thursday, October 1/ });
    expect(card).toHaveTextContent("Fri 10:30 AM · CSC 221 title");
    expect(card).not.toHaveTextContent("Tomorrow");
  });

  it("lists the day's all-day deadlines for the student, matching the strip's count", async () => {
    state.profile = ok({ ...PROFILE, standing: { standing: "senior", estimated: true } });
    state.plan = ok(plan({ deadlines: [] }));
    await show(panel("2026-10-01", false));
    const allDay = screen.getByTestId("timeline-all-day");
    expect(allDay).toHaveTextContent("Due that day");
    expect(allDay).toHaveTextContent("Minor Declaration Deadline for Seniors");
    expect(screen.getByTestId("timeline-empty")).toHaveTextContent("No classes that day.");
  });

  it("lists a syllabus deadline with the day's all-day ones: no time, no link, its source said", async () => {
    state.plan = ok(
      plan({
        deadlines: [
          {
            id: "64b7f0a1c2d3e4f5a6b7c8e4",
            title: "Midterm exam",
            courseCode: "CSC 221",
            dueAt: "2026-10-01T23:59:00-04:00",
            origin: "syllabus",
            syllabusId: "64b7f0a1c2d3e4f5a6b7c8e1",
            allDay: true,
          },
        ],
      }),
    );
    await show(panel("2026-10-01", false));
    const row = within(screen.getByTestId("timeline-all-day"))
      .getByText("Midterm exam")
      .closest("li")!;
    expect(row).toHaveAttribute("data-source", "my-plan");
    expect(row).toHaveTextContent("Due that day");
    expect(row).toHaveTextContent("From your syllabus");
    expect(row).not.toHaveTextContent("11:59");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(document.querySelector('[data-kind="deadline"]')).toBeNull();
  });

  it("never draws WebTree's opening as a deadline", async () => {
    state.plan = ok(plan({ deadlines: [] }));
    state.schedule = (day: string) => ok(schedule(day, { entries: [], empty: "no-classes-today" }));
    await show(
      TimelinePanel({
        userId: USER,
        now: new Date("2026-10-12T12:00:00-04:00"),
        timeZone: TZ,
        day: "2026-10-12",
        stripDays: stripDays("2026-10-12"),
        eventsOn: false,
      }),
    );
    expect(document.querySelector('[data-kind="deadline"]')).toBeNull();
    expect(screen.queryByText(/WebTree Open/)).toBeNull();
  });

  it("degrades to its error state when building the day throws", async () => {
    state.curatedThrows = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await show(panel());
    expect(screen.getByTestId("panel-error")).toHaveTextContent("Your schedule could not load");
    log.mockRestore();
  });
});

/** Items/icons from the hidden Classes tabpanel (or a collapsed ShowMore) don't count as drawn. */
function live<T extends Element>(elements: T[]): T[] {
  return elements.filter((el) => !el.closest("[hidden]"));
}

describe("Due for you", () => {
  it("lists the calendar, the programs and the student's deadline, each linked", async () => {
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const card = screen.getByRole("region", { name: /^Due for you/ });
    const items = live(within(card).getAllByTestId("due-soon-item"));
    expect(items.length).toBeGreaterThan(3);
    const own = items.find((li) => li.dataset.kind === "student");
    expect(own).toHaveTextContent("Problem set");
    expect(own).toHaveTextContent("Tomorrow 11:59p");
    const webtree = items.find((li) => li.textContent?.includes("WebTree Open"));
    expect(webtree).toHaveTextContent("Oct 12 – Nov 3");
    const minor = items.find((li) => li.textContent?.includes("Minor Declaration"));
    expect(minor).toHaveTextContent("For: Seniors (Class of 2027)");
    // Every row carries its source and says it to screen readers; on screen, in its meta line, once per run.
    for (const li of items) {
      expect(li.dataset.source, li.textContent ?? "").toBeTruthy();
      expect(li.querySelector(`[data-source="${li.dataset.source}"]`)).toHaveTextContent(
        /^Source: /,
      );
    }
    expect(webtree).toHaveAttribute("data-source", "registrar");
    expect(within(webtree!).getByText("via Registrar", { exact: false })).not.toHaveClass(
      "sr-only",
    );
    // Every row's link goes to the page that publishes it (the /syllabi pointer under the list is not a row).
    for (const link of items.flatMap((li) => within(li).queryAllByRole("link"))) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("counts the rows listed for the student, the header's number, and lists the others after them", async () => {
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const card = screen.getByRole("region", { name: /^Due for you/ });
    const mine = within(
      within(card).getByRole("list", { name: "Due for you in the next two weeks" }),
    ).getAllByTestId("due-soon-item");
    // The problem set and the WebTree window: the count beside the title says 2, as the header does.
    expect(mine.map((li) => li.dataset.forYou)).toEqual(["true", "true"]);
    expect(screen.getByRole("region", { name: "Due for you 2" })).toBe(card);
    const also = within(card).getByRole("list", { name: "Also in the next two weeks" });
    const others = within(also).getAllByTestId("due-soon-item");
    expect(others.every((li) => li.dataset.forYou === "false")).toBe(true);
    expect(others.map((li) => li.textContent).join(" ")).toContain("Minor Declaration");
    // The first rows are the student's, then the others, in the DOM as on screen.
    const all = live(within(card).getAllByTestId("due-soon-item"));
    expect(all.slice(0, 2)).toEqual(mine);
  });

  it("draws a row in red only when it is the student's and due today", async () => {
    state.plan = ok(plan({ deadlines: [{ ...DEADLINE, dueAt: "2026-09-30T17:00:00-04:00" }] }));
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const items = live(screen.getAllByTestId("due-soon-item"));
    // The seniors' Watson nomination is due today at 3 PM too, but it is not this first-year's.
    const watson = items.find((li) => li.textContent?.includes("Watson"));
    expect(watson).toHaveTextContent(/Today/);
    expect(watson?.dataset.forYou).toBe("false");
    expect(watson).not.toHaveAttribute("data-urgent");
    expect(watson?.querySelector(".text-urgent")).toBeNull();
    expect(within(watson!).queryByTestId("due-urgent-icon")).toBeNull();
    const own = items.find((li) => li.dataset.kind === "student");
    expect(own).toHaveAttribute("data-urgent", "true");
    expect(own?.querySelector(".text-urgent")).toHaveTextContent("Today 5:00p");
    // Never colour alone (red is also the accent): an alarm icon beside the words.
    expect(own?.querySelector(".text-urgent")).toContainElement(
      within(own!).getByTestId("due-urgent-icon"),
    );
    expect(live(screen.getAllByTestId("due-urgent-icon"))).toHaveLength(1);
    expect(items.filter((li) => li.dataset.urgent === "true")).toEqual([own]);
  });

  it("holds the rest back behind one real button that shows them in place", async () => {
    const user = userEvent.setup();
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const card = screen.getByRole("region", { name: /^Due for you/ });
    const { from, to } = dueSoonRange(NOON);
    const total = buildDueSoon({
      now: NOON,
      standing: "first-year",
      contentDeadlines: deadlinesBetween(from, to),
      studentDeadlines: [DEADLINE],
    }).length;
    const visible = () =>
      within(card)
        .getAllByTestId("due-soon-item")
        .filter((li) => !li.closest("[hidden]"));
    expect(visible()).toHaveLength(8);
    const more = total - 8;
    expect(more).toBeGreaterThan(0);
    const button = within(card).getByRole("button", {
      name: `Show ${more} more in the next two weeks`,
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(card).not.toHaveTextContent(/And \d+ more/);
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(visible()).toHaveLength(total);
    const revealed = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(revealed).toBeVisible();
    expect(within(revealed!).getAllByTestId("due-soon-item")).toHaveLength(more);
    await user.click(screen.getByRole("button", { name: /^Show fewer/ }));
    expect(visible()).toHaveLength(8);
  });

  it("keeps the calendar and program rows when only the plan fails", async () => {
    state.plan = FAIL;
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    expect(screen.queryByTestId("panel-error")).toBeNull();
    expect(screen.getByTestId("due-soon-own-error")).toHaveTextContent(
      "Your own deadlines could not load right now.",
    );
    const items = live(screen.getAllByTestId("due-soon-item"));
    expect(items.some((li) => li.textContent?.includes("WebTree Open"))).toBe(true);
    expect(items.some((li) => li.dataset.kind === "student")).toBe(false);
  });

  it("gives WebTree its registration kind, not a deadline's", async () => {
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const webtree = live(screen.getAllByTestId("due-soon-item")).find((li) =>
      li.textContent?.includes("WebTree Open"),
    );
    expect(webtree).toHaveAttribute("data-kind", "registration");
  });

  it("filters to the student's class deadlines on the Classes tab, syllabus ones included", async () => {
    const user = userEvent.setup();
    state.plan = ok(
      plan({
        deadlines: [
          DEADLINE,
          {
            id: "64b7f0a1c2d3e4f5a6b7c8e0",
            title: "Reading response",
            courseCode: "ENV 237",
            dueAt: "2026-10-02T23:59:00-04:00",
            origin: "syllabus",
            syllabusId: "64b7f0a1c2d3e4f5a6b7c8e1",
          },
        ],
      }),
    );
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const card = screen.getByRole("region", { name: /^Due for you/ });
    // Each tab says how many of its rows are for the student, so the number follows the view.
    expect(within(card).getByRole("tab", { name: "All 3 for you" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(within(card).getByRole("tab", { name: "Coursework 2 for you" }));
    expect(within(card).getByTestId("due-coursework-note")).toHaveTextContent(
      "Only deadlines for your courses. Registrar and office deadlines are under All.",
    );
    const items = live(within(card).getAllByTestId("due-soon-item"));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((li) => li.querySelector("[data-course-color]"))).toBe(true);
    const reading = items.find((li) => li.textContent?.includes("Reading response"))!;
    expect(items.some((li) => li.textContent?.includes("WebTree Open"))).toBe(false);
    // A syllabus deadline says where it came from, with the smallest AI chip (an AI read it).
    expect(reading).toHaveAttribute("data-source", "my-plan");
    expect(reading).toHaveTextContent("From your syllabus");
    expect(within(reading).getByText(/^AI-generated content:/)).toHaveClass("sr-only");
    // The student's own typed deadline says nothing on screen; screen readers hear it is theirs.
    const own = items.find((li) => li.textContent?.includes("Problem set"))!;
    expect(own).not.toHaveTextContent("From your syllabus");
    expect(within(own).getByText("Source: your plan")).toHaveClass("sr-only");
    // Arrow keys move between the tabs.
    await user.keyboard("{ArrowLeft}");
    expect(within(card).getByRole("tab", { name: /^All/ })).toHaveFocus();
    expect(within(card).getByRole("tab", { name: /^All/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("says Moodle on a deadline imported from the student's Moodle calendar, and only there", async () => {
    state.plan = ok(
      plan({
        deadlines: [
          DEADLINE,
          {
            id: "64b7f0a1c2d3e4f5a6b7c8e2",
            title: "Problem set 3",
            courseCode: "CSC 221",
            dueAt: "2026-10-01T23:59:00-04:00",
            origin: "moodle",
          },
        ],
      }),
    );
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const card = screen.getByRole("region", { name: /^Due for you/ });
    const rows = live(within(card).getAllByTestId("due-soon-item"));
    const moodle = rows.find((li) => li.textContent?.includes("Problem set 3"))!;
    // The same rule as every other synced source: "via Moodle" in its meta line.
    expect(moodle).toHaveAttribute("data-source", "course-site");
    expect(moodle.querySelector('[data-source="course-site"]')).toHaveTextContent(
      "Source: via Moodle",
    );
    expect(within(moodle).getByText("via Moodle", { exact: false })).not.toHaveClass("sr-only");
    const typed = rows.find((li) => li.textContent?.startsWith("Problem set"))!;
    expect(typed.querySelector('[data-source="course-site"]')).toBeNull();
  });

  it("counts a Moodle deadline as coursework even when its course name gives no course code", async () => {
    const user = userEvent.setup();
    state.plan = ok(
      plan({
        deadlines: [
          DEADLINE,
          {
            id: "64b7f0a1c2d3e4f5a6b7c8e3",
            title: "Advising worksheet",
            dueAt: "2026-10-02T13:00:00-04:00",
            origin: "moodle",
          },
        ],
      }),
    );
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    const card = screen.getByRole("region", { name: /^Due for you/ });
    await user.click(within(card).getByRole("tab", { name: "Coursework 2 for you" }));
    const items = live(within(card).getAllByTestId("due-soon-item"));
    expect(items.map((li) => li.dataset.source).sort()).toEqual(["course-site", "my-plan"]);
  });

  it("points to /syllabi while the student has classes but no syllabus or Moodle connection", async () => {
    state.plan = ok(plan({ deadlines: [DEADLINE] }));
    const { unmount } = await show(DueSoonPanel({ userId: USER, now: NOON }));
    expect(
      screen.getByRole("link", { name: /Add your syllabi or connect Moodle/ }),
    ).toHaveAttribute("href", "/syllabi");
    unmount();

    state.moodle = true;
    const second = await show(DueSoonPanel({ userId: USER, now: NOON }));
    expect(screen.queryByTestId("syllabi-pointer")).not.toBeInTheDocument();
    second.unmount();

    state.moodle = false;
    state.syllabi = 1;
    const third = await show(DueSoonPanel({ userId: USER, now: NOON }));
    expect(screen.queryByTestId("syllabi-pointer")).not.toBeInTheDocument();
    third.unmount();

    // No classes this term: nothing to add syllabi for.
    state.syllabi = 0;
    state.plan = ok(plan({ items: [], deadlines: [] }));
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    expect(screen.queryByTestId("syllabi-pointer")).not.toBeInTheDocument();
  });

  it("says only syllabi in the pointer while the Moodle import is off", async () => {
    vi.stubEnv("MOODLE_IMPORT_ENABLED", "false");
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    expect(screen.getByTestId("syllabi-pointer")).toHaveTextContent(
      "Add your syllabi to see your class deadlines here",
    );
    vi.unstubAllEnvs();
  });

  it("degrades to a small error state when building the list throws", async () => {
    state.curatedThrows = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await show(DueSoonPanel({ userId: USER, now: NOON }));
    // The card's new name in every state: never "Due soon".
    expect(screen.getByRole("region", { name: "Due for you" })).toBeVisible();
    expect(screen.getByTestId("panel-error")).toHaveTextContent(
      "Due for you could not load right now.",
    );
    expect(document.body).not.toHaveTextContent(/due soon/i);
    expect(log).toHaveBeenCalledWith("[today] could not build Due for you:", expect.any(Error));
    log.mockRestore();
  });

  it("loads under the same name", async () => {
    const { PanelSkeleton } = await import("@/app/(hub)/today/_components/panel-states");
    const { DUE_SOON_TITLE } = await import("@/app/(hub)/today/_components/due-soon-panel");
    render(<PanelSkeleton id="due-soon" title={DUE_SOON_TITLE} />);
    expect(screen.getByRole("region", { name: "Due for you" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Loading due for you…");
  });
});

describe("this week on campus", () => {
  it("lists the next events with their links", async () => {
    await show(CampusPanel({ now: NOON, timeZone: TZ }));
    const items = screen.getAllByTestId("campus-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Today, 7:00 PM · Alvarez Student Union");
    expect(items[1]).toHaveTextContent("Thursday, October 1, 4:00 PM");
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
  });

  it("leaves out long-running items already under way", async () => {
    state.campus = ok([
      feed("season", "2026-07-23T09:00:00-04:00", "2026-10-01T17:00:00-04:00", {
        title: "Rhodes Scholarship Application Deadlines",
      }),
      ...FEEDS,
    ]);
    await show(CampusPanel({ now: NOON, timeZone: TZ }));
    expect(screen.getAllByTestId("campus-item")).toHaveLength(2);
    expect(screen.queryByText(/Rhodes/)).toBeNull();
    expect(screen.queryByText(/Under way/)).toBeNull();
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
    await show(OpportunitiesPanel({ userId: USER, now: NOON, careersOn: true }));
    const items = screen.getAllByTestId("opportunity-item");
    expect(items.length).toBeGreaterThan(1);
    const handshake = items[items.length - 1];
    expect(within(handshake!).getByRole("link")).toHaveAttribute(
      "href",
      "https://davidson.joinhandshake.com/",
    );
    expect(screen.getByRole("link", { name: "Careers" })).toHaveAttribute("href", "/careers");
  });

  it("names a program's office once per run of rows from that office", async () => {
    await show(OpportunitiesPanel({ userId: USER, now: NOON, careersOn: true }));
    const rows = screen.getAllByTestId("opportunity-item").slice(0, -1);
    const notes = rows.map((li) => li.querySelector("span[data-source]")!);
    expect(notes.every((note) => /^Source: via /.test(note.textContent ?? ""))).toBe(true);
    notes.forEach((note, i) => {
      const repeat = i > 0 && note.textContent === notes[i - 1]!.textContent;
      expect(note.classList.contains("sr-only"), note.textContent ?? "").toBe(repeat);
    });
    // The fixture has a run (two Office of Fellowships programs in a row).
    expect(notes.some((note) => note.classList.contains("sr-only"))).toBe(true);
  });

  it("leaves out the Careers link while careers is off", async () => {
    await show(OpportunitiesPanel({ userId: USER, now: NOON, careersOn: false }));
    expect(screen.queryByRole("link", { name: "Careers" })).toBeNull();
  });

  it("says who a program is for, and keeps only the short date beside the title", async () => {
    await show(
      OpportunitiesPanel({
        userId: USER,
        now: new Date("2026-10-12T12:00:00-04:00"),
        careersOn: true,
      }),
    );
    const items = screen.getAllByTestId("opportunity-item").slice(0, -1);
    expect(items.length).toBeGreaterThan(0);
    // At least one program on Oct 12 is for seniors or graduate students: the first-year sees who it is for.
    expect(screen.getAllByTestId("opportunity-audience").length).toBeGreaterThan(0);
    for (const li of items) {
      const date = li.querySelector("p.shrink-0");
      expect(date?.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    }
  });

  it("links the portals", () => {
    const { container } = render(QuickLinks());
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(9);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(container.querySelector(".break-words")).toBeNull();
  });
});

describe("panel boundaries", () => {
  it("turns a panel that throws while rendering into its error state, and the others still render", async () => {
    const { PanelBoundary } = await import("@/app/(hub)/today/_components/panel-boundary");
    function Boom(): React.ReactElement {
      throw new Error("render failed");
    }
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <>
        <PanelBoundary id="due-soon" title="Due for you" what="Due for you">
          <Boom />
        </PanelBoundary>
        <PanelBoundary id="quick-links" title="Quick links" what="Quick links">
          {QuickLinks()}
        </PanelBoundary>
      </>,
    );
    expect(screen.getByTestId("panel-error")).toHaveTextContent("Due for you could not load");
    expect(screen.getByRole("region", { name: /Quick links/ })).toBeVisible();
    expect(screen.getAllByRole("link").length).toBe(9);
    log.mockRestore();
  });
});

describe("the action row", () => {
  it("shows nothing once first-run setup is done", async () => {
    await show(TodayActions({ userId: USER }));
    expect(screen.queryByTestId("onboarding-nudge")).toBeNull();
  });

  it("nudges to /onboarding until setup is done", async () => {
    state.profile = ok({ ...PROFILE, onboardedAt: null });
    await show(TodayActions({ userId: USER }));
    const nudge = screen.getByTestId("onboarding-nudge");
    expect(
      within(nudge).getByRole("heading", { name: "Finish setting up MakeItSo" }),
    ).toBeVisible();
    expect(within(nudge).getByRole("link", { name: "Set up my plan" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });

  it("stays hidden when the profile cannot load (never shown without a real reason)", async () => {
    state.profile = FAIL;
    await show(TodayActions({ userId: USER }));
    expect(screen.queryByTestId("onboarding-nudge")).toBeNull();
  });
});
