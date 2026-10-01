import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/lib/types/feeds";
import type { DayScheduleEntry, PlanItem, StudentDeadline } from "@/lib/types/plan";
import type { Program } from "@/lib/types/content";
import { deadlinesBetween } from "@/server/content/deadlines";
import { ACADEMIC_CALENDAR } from "@/server/content/academic-calendar";
import {
  agendaWindow,
  audienceIncludes,
  breakOn,
  buildAgenda,
  buildDueSoon,
  calendarDeadlineRows,
  dayBounds,
  degreeMapTerms,
  dueLabel,
  dueSoonRange,
  etClock,
  MAX_TIMELINE_EVENTS,
  milestonesOn,
  pickShown,
  pickTimelineEvents,
  quickLinks,
  QUICK_LINK_SLUGS,
  stripCount,
  stripDay,
  stripDays,
  upcomingOpportunities,
  webTreeWindow,
  WEBTREE_LEAD_DAYS,
  zonedInstant,
} from "@/server/today";
import { feedRange, parseDayParam, todayHref } from "@/app/(hub)/today/_lib/params";

/**
 * The pure rules behind /today (PLAN §3, §5 Dates/times and Sources): the academic calendar reading (breaks,
 * milestones, audiences, the WebTree window), the timeline's items and hours, Due soon, the degree map, the week
 * strip, opportunities and quick links, and the URL's ?day=. No database.
 */

const edt = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00-04:00`);
const ID = "64b7f0a1c2d3e4f5a6b7c8d9";

function entry(over: Partial<DayScheduleEntry> = {}): DayScheduleEntry {
  return {
    crn: "10144",
    courseCode: "CSC 221",
    title: "Data Structures",
    kind: "class",
    start: "10:30",
    end: "11:20",
    startsAt: edt("10:30").toISOString(),
    endsAt: edt("11:20").toISOString(),
    building: "Watson Life Sciences Building",
    room: "132",
    ...over,
  };
}

function feed(over: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    source: "wildcatsync",
    kind: "event",
    title: `Event ${over.id}`,
    url: "https://davidson.campuslabs.com/engage/event/1",
    startsAt: edt("15:00").toISOString(),
    endsAt: edt("16:00").toISOString(),
    allDay: false,
    location: null,
    summaryText: null,
    fetchedAt: edt("09:00").toISOString(),
    ...over,
  };
}

function deadline(over: Partial<StudentDeadline> = {}): StudentDeadline {
  return { id: ID, title: "Problem set", dueAt: edt("23:59").toISOString(), ...over };
}

describe("the academic calendar on Today", () => {
  it("finds the break a day falls in", () => {
    expect(breakOn("2026-09-21")?.name).toBe("Fall Break");
    expect(breakOn("2026-09-22")?.name).toBe("Fall Break");
    expect(breakOn("2026-09-23")).toBeNull();
    expect(breakOn("2026-11-25")?.name).toBe("Thanksgiving Break");
  });

  it("names WebTree opening on its first day, at its published time", () => {
    const [webtree, ...rest] = milestonesOn("2026-10-12");
    expect(webtree).toEqual({
      name: "WebTree",
      verb: "opens",
      at: edt("07:00", "2026-10-12"),
      day: "2026-10-12",
    });
    // The advising conferences start that day too, but they are not a registration window.
    expect(rest).toEqual([]);
    expect(milestonesOn("2026-10-13")).toEqual([]);
  });

  it("names other openings, a timed break start, and skips single-day notices", () => {
    expect(milestonesOn("2027-01-05").map((m) => `${m.name} ${m.verb}`)).toEqual([
      "Banner Self-Service Add/Drop opens",
    ]);
    expect(milestonesOn("2026-11-09").map((m) => `${m.name} ${m.verb}`)).toEqual([
      "Banner Self-Service Add/Drop (Spring 2027) opens",
    ]);
    const thanksgiving = milestonesOn("2026-11-20");
    expect(thanksgiving).toMatchObject([{ name: "Thanksgiving Break", verb: "begins" }]);
    expect(thanksgiving[0]?.at?.toISOString()).toBe("2026-11-20T21:20:00.000Z"); // 4:20 PM EST
    // "Spring 2027 Student Schedules Available": a Due soon item, not a milestone.
    expect(milestonesOn("2026-11-06")).toEqual([]);
    // Fall Break has no time: the lead says it ("no classes today for Fall Break").
    expect(milestonesOn("2026-09-21")).toEqual([]);
  });

  it.each([
    [null, "first-year", true],
    ["All students", "first-year", true],
    ["Seniors (Class of 2027)", "senior", true],
    ["Seniors (Class of 2027)", "first-year", false],
    ["Sophomores, juniors, and seniors", "junior", true],
    ["Sophomores, juniors, and seniors", "first-year", false],
    ["New students", "incoming", true],
    ["New students", "first-year", true],
    ["Students planning a January graduation", "senior", false],
    ["Seniors (Class of 2027)", null, false],
  ] as const)("audience %j for a %s → %s", (audience, standing, expected) => {
    expect(audienceIncludes(audience, standing)).toBe(expected);
  });

  it("counts deadline rows for the student's year only", () => {
    expect(calendarDeadlineRows("2026-09-30", "2026-10-03", "senior").map((r) => r.id)).toEqual([
      "f26-minor-declaration",
    ]);
    expect(calendarDeadlineRows("2026-09-30", "2026-10-03", "first-year")).toEqual([]);
    expect(calendarDeadlineRows("2026-11-01", "2026-11-03", "first-year").map((r) => r.id)).toEqual(
      ["f26-webtree-closes"],
    );
  });
});

describe("the WebTree window (Plan Spring 2027)", () => {
  const opens = edt("07:00", "2026-10-12");
  it("is upcoming from two weeks before it opens", () => {
    const at = edt("12:00");
    const window = webTreeWindow("202602", at);
    expect(window).toMatchObject({
      termLabel: "Spring 2027",
      state: "upcoming",
      source: "registrar",
    });
    expect(window?.opensAt).toEqual(opens);
    expect(window?.closesAt.toISOString()).toBe("2026-11-03T22:00:00.000Z"); // 5 PM EST
    expect(window?.url).toMatch(/^https:\/\/www\.davidson\.edu\//);
    expect(
      webTreeWindow("202602", new Date(opens.getTime() - WEBTREE_LEAD_DAYS * 86_400_000 - 1)),
    ).toBeNull();
  });

  it("is open from 7 a.m. Oct 12 until 5 p.m. Nov 3", () => {
    expect(webTreeWindow("202602", opens)?.state).toBe("open");
    expect(webTreeWindow("202602", new Date("2026-11-03T21:59:00Z"))?.state).toBe("open");
    expect(webTreeWindow("202602", new Date("2026-11-03T22:00:00Z"))).toBeNull();
  });

  it("is null for a term the calendar has no window for, and closes at midnight without a closing row", () => {
    expect(webTreeWindow("202702", edt("12:00"))).toBeNull();
    const calendar = ACADEMIC_CALENDAR.filter((row) => row.id !== "f26-webtree-closes");
    const window = webTreeWindow("202602", edt("12:00"), calendar);
    expect(window?.closesAt.toISOString()).toBe("2026-11-04T05:00:00.000Z");
  });

  it("covers the Fall 2027 window in the spring", () => {
    const window = webTreeWindow("202701", edt("12:00", "2027-03-20"));
    expect(window).toMatchObject({ termLabel: "Fall 2027", state: "open" });
  });
});

describe("the timeline's items and hours", () => {
  it("draws classes, the student's and the calendar's timed deadlines, and a few events", () => {
    const agenda = buildAgenda({
      day: "2026-09-30",
      schedule: {
        entries: [
          entry(),
          entry({ crn: "10230", courseCode: "ENV 237", start: "14:30", end: "15:45", kind: "lab" }),
        ],
      },
      studentDeadlines: [
        deadline({ courseCode: "CSC 221" }),
        deadline({ title: "Tomorrow", dueAt: edt("09:00", "2026-10-01").toISOString() }),
      ],
      contentDeadlines: deadlinesBetween("2026-09-30", "2026-09-30"),
      feedItems: [
        feed({ id: "a", startsAt: edt("12:30").toISOString(), endsAt: edt("13:00").toISOString() }),
        feed({ id: "b" }),
        feed({ id: "c", allDay: true }),
        feed({ id: "d", endsAt: null }),
        feed({ id: "e", startsAt: edt("08:00").toISOString(), endsAt: edt("20:00").toISOString() }),
        feed({ id: "f", startsAt: edt("19:00", "2026-10-01").toISOString(), endsAt: null }),
        feed({ id: "g", kind: "deadline", startsAt: edt("17:00").toISOString(), endsAt: null }),
      ],
      now: edt("12:00"),
    });
    expect(
      agenda.items.map((i) => `${i.kind} ${i.start}${i.end ? `-${i.end}` : ""} ${i.title}`),
    ).toEqual([
      "class 10:30-11:20 Data Structures",
      "class 14:30-15:45 Data Structures",
      "deadline 23:59 Problem set",
      "event 12:30-13:00 Event a",
      "event 15:00-16:00 Event b",
      "deadline 17:00 Event g",
    ]);
    expect(agenda.items[0]).toMatchObject({
      code: "CSC 221",
      location: "Watson Life Sciences Building 132",
      source: "course-schedule",
    });
    expect(agenda.items[1]).toMatchObject({ code: "ENV 237", detail: "Lab" });
    expect(agenda.items[2]).toMatchObject({ code: "CSC 221", source: "my-plan" });
    expect(agenda.items[3]).toMatchObject({ source: "wildcatsync" });
    expect(agenda.moreEvents).toBe(0);
    // 9a–4p stretched to the 11:59 PM deadline.
    expect(agenda).toMatchObject({ startHour: 9, endHour: 24 });
  });

  it("shows at most three events, the ones not over yet on the current day", () => {
    const items = ["10:00", "13:00", "14:00", "15:00", "16:00"].map((start, i) =>
      feed({
        id: String(i),
        startsAt: edt(start).toISOString(),
        endsAt: new Date(edt(start).getTime() + 3_600_000).toISOString(),
      }),
    );
    const today = pickTimelineEvents("2026-09-30", items, edt("12:00"));
    expect(today.shown.map((e) => e.id)).toEqual(["1", "2", "3"]);
    expect(today.more).toBe(1);
    const otherDay = pickTimelineEvents("2026-09-30", items);
    expect(otherDay.shown).toHaveLength(MAX_TIMELINE_EVENTS);
    expect(otherDay.more).toBe(2);
  });

  it("puts a calendar row's published time on the line, with its stored source", () => {
    const agenda = buildAgenda({
      day: "2026-10-12",
      schedule: { entries: [] },
      studentDeadlines: [],
      contentDeadlines: deadlinesBetween("2026-10-12", "2026-10-12"),
      feedItems: [],
    });
    expect(agenda.items).toEqual([
      {
        id: "content-calendar:f26-webtree-spring27",
        kind: "deadline",
        title: "WebTree Open: Submit Spring 2027 Course Preferences",
        start: "07:00",
        source: "registrar",
      },
    ]);
    expect(agenda).toMatchObject({ startHour: 7, endHour: 16 });
  });

  it("keeps 9a–4p by default and never starts before 7a", () => {
    expect(agendaWindow([])).toEqual({ startHour: 9, endHour: 16 });
    expect(
      agendaWindow([
        {
          id: "x",
          kind: "class",
          title: "Early",
          start: "05:30",
          end: "06:20",
          source: "course-schedule",
        },
      ]),
    ).toEqual({ startHour: 7, endHour: 16 });
  });
});

describe("Due soon", () => {
  const now = edt("12:00");
  const content = (() => {
    const { from, to } = dueSoonRange(now);
    return deadlinesBetween(from, to);
  })();

  it("merges calendar rows, windows, program deadlines and the student's own over two weeks", () => {
    const items = buildDueSoon({
      now,
      standing: "first-year",
      contentDeadlines: content,
      studentDeadlines: [
        deadline({ courseCode: "CSC 221", dueAt: edt("23:59", "2026-10-01").toISOString() }),
        deadline({
          id: "64b7f0a1c2d3e4f5a6b7c8d0",
          title: "Past",
          dueAt: edt("08:00").toISOString(),
        }),
        deadline({
          id: "64b7f0a1c2d3e4f5a6b7c8d1",
          title: "Later",
          dueAt: edt("12:00", "2026-10-20").toISOString(),
        }),
      ],
    });
    expect(dueSoonRange(now)).toEqual({ from: "2026-09-30", to: "2026-10-13" });
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds).toEqual(new Set(["deadline", "window", "program", "student"]));
    expect(items.every((i) => i.day >= "2026-09-30" && i.day <= "2026-10-13")).toBe(true);
    expect(items.map((i) => i.title)).not.toContain("Past");
    expect(items.map((i) => i.title)).not.toContain("Later");
    const days = items.map((i) => i.day);
    expect(days).toEqual([...days].sort());

    const minor = items.find((i) => i.id === "calendar:f26-minor-declaration");
    expect(minor).toMatchObject({
      forYou: false,
      audience: "Seniors (Class of 2027)",
      source: "registrar",
    });
    const webtree = items.find((i) => i.id === "calendar:f26-webtree-spring27");
    expect(webtree).toMatchObject({ kind: "window", forYou: true, endDay: "2026-11-03" });
    const own = items.find((i) => i.kind === "student");
    expect(own).toMatchObject({
      source: "my-plan",
      courseCode: "CSC 221",
      url: null,
      time: "23:59",
    });
    for (const item of items.filter((i) => i.kind === "program")) {
      expect(["matthews-center", "hurt-hub-programs", "registrar", "davidson-offices"]).toContain(
        item.source,
      );
      expect(item.url).toMatch(/^https:\/\//);
    }
  });

  it("keeps a window under way while it lasts, sorted as of today", () => {
    const at = edt("12:00", "2026-10-20");
    const { from, to } = dueSoonRange(at);
    const items = buildDueSoon({
      now: at,
      standing: "first-year",
      contentDeadlines: deadlinesBetween(from, to),
      studentDeadlines: [],
    });
    expect(items[0]).toMatchObject({ id: "calendar:f26-webtree-spring27", ongoing: true });
    expect(dueLabel(items[0]!, at)).toBe("Until Nov 3");
  });

  it("drops a timed deadline once its time has passed, keeps an all-day one all day", () => {
    const at = new Date("2026-11-03T22:30:00Z"); // 5:30 PM EST, WebTree closed at 5
    const { from, to } = dueSoonRange(at);
    const items = buildDueSoon({
      now: at,
      standing: "first-year",
      contentDeadlines: deadlinesBetween(from, to),
      studentDeadlines: [],
    });
    expect(items.map((i) => i.id)).not.toContain("calendar:f26-webtree-closes");
    const before = buildDueSoon({
      now: new Date("2026-11-03T21:00:00Z"),
      standing: "first-year",
      contentDeadlines: deadlinesBetween(from, to),
      studentDeadlines: [],
    });
    expect(before.map((i) => i.id)).toContain("calendar:f26-webtree-closes");
  });

  it("never lets office programs push the calendar or the student's own out of the list", () => {
    const items = buildDueSoon({
      now,
      standing: "first-year",
      contentDeadlines: content,
      studentDeadlines: [deadline({ dueAt: edt("12:00", "2026-10-13").toISOString() })],
    });
    expect(items.length).toBeGreaterThan(4);
    const shown = pickShown(items, 4);
    expect(shown).toHaveLength(4);
    const ids = shown.map((i) => i.id);
    expect(ids).toContain("calendar:f26-webtree-spring27");
    expect(ids).toContain("calendar:f26-minor-declaration");
    expect(ids).toContain(`student:${ID}`);
    expect(shown.map((i) => i.day)).toEqual(shown.map((i) => i.day).sort());
    expect(pickShown(items, 100)).toEqual(items);
  });

  it.each([
    [{ day: "2026-09-30", time: "17:00" }, "Today 5:00p"],
    [{ day: "2026-10-01", time: null }, "Tomorrow"],
    [{ day: "2026-10-02", time: "23:59" }, "Fri 11:59p"],
    [{ day: "2026-10-12", time: null }, "Mon Oct 12"],
    [{ day: "2026-10-12", time: "07:00", endDay: "2026-11-03" }, "Oct 12 – Nov 3"],
    [{ day: "2026-09-21", time: null, endDay: "2026-10-05" }, "Until Oct 5"],
  ])("labels %j as %s", (over, label) => {
    const item = {
      id: "x",
      kind: "deadline" as const,
      title: "x",
      label: null,
      audience: null,
      forYou: true,
      endDay: null,
      dueAt: null,
      ongoing: false,
      courseCode: null,
      source: "registrar" as const,
      url: null,
      verifiedAt: null,
      ...over,
    };
    expect(dueLabel(item, now)).toBe(label);
  });
});

describe("the degree map", () => {
  const item = (over: Partial<PlanItem>): PlanItem => ({
    id: ID,
    termCode: "202601",
    courseCode: "CSC 221",
    canonicalCode: "CSC 221",
    title: "Data Structures",
    credits: 1,
    status: "in-progress",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...over,
  });

  it("lays out the first term through the graduation spring, with statuses as slots", () => {
    const terms = degreeMapTerms({
      firstTerm: "202501",
      graduationYear: 2029,
      currentTerm: "202601",
      items: [
        item({ courseCode: "ECO 232", status: "registered" }),
        item({}),
        item({ termCode: "202501", courseCode: "CSC 121", status: "completed" }),
        item({ termCode: "202501", courseCode: "HIS 101", status: "failed" }),
        item({ termCode: "202702", courseCode: "HIS 357", status: "planned" }),
        item({ termCode: null, courseCode: "MAT 112", status: "completed", source: "ap" }),
        item({ termCode: "202601", courseCode: "DRO 100", status: "dropped" }),
      ],
    });
    expect(terms[0]).toMatchObject({ termCode: "202501", label: "Fall 2025" });
    expect(terms[terms.length - 1]).toMatchObject({ termCode: "202802", label: "Spring 2029" });
    expect(terms.filter((t) => t.termCode.endsWith("03"))).toHaveLength(3);
    const byCode = Object.fromEntries(terms.map((t) => [t.termCode, t]));
    expect(byCode["202501"]?.slots).toEqual([{ status: "done", code: "CSC 121", credits: 1 }]);
    expect(byCode["202601"]).toMatchObject({
      isCurrent: true,
      slots: [
        { status: "in-progress", code: "CSC 221", credits: 1 },
        { status: "in-progress", code: "ECO 232", credits: 1 },
      ],
    });
    expect(byCode["202702"]?.slots).toEqual([{ status: "planned", code: "HIS 357", credits: 1 }]);
    expect(byCode["202502"]?.isCurrent).toBeUndefined();
  });

  it("widens the range to a term outside it that holds items", () => {
    const terms = degreeMapTerms({
      firstTerm: "202601",
      graduationYear: 2030,
      currentTerm: "202601",
      items: [item({ termCode: "203001", status: "planned" })],
    });
    expect(terms[terms.length - 1]?.termCode).toBe("203001");
  });
});

describe("the week strip", () => {
  it("shows Monday to Friday of this week, or of next week on a weekend", () => {
    expect(stripDays("2026-09-30")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(stripDays("2026-09-28")[0]).toBe("2026-09-28");
    expect(stripDays("2026-10-02")[0]).toBe("2026-09-28");
    expect(stripDays("2026-10-03")[0]).toBe("2026-10-05");
    expect(stripDays("2026-10-04")[0]).toBe("2026-10-05");
    expect(stripDays("2026-11-01")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });

  it("counts a day's classes and the deadlines for the student", () => {
    const schedule = { entries: [entry(), entry({ crn: "10181", start: "11:30" })] };
    expect(stripCount({ day: "2026-09-30", schedule }, [deadline()], "first-year")).toBe(3);
    // Oct 1: the seniors' minor declaration deadline.
    expect(stripCount({ day: "2026-10-01", schedule: null }, [], "senior")).toBe(1);
    expect(stripCount({ day: "2026-10-01", schedule: null }, [], "first-year")).toBe(0);
  });

  it("marks today, the day shown and the links", () => {
    const href = (d: string) => todayHref(d, "2026-09-30");
    const input = { day: "2026-09-30", schedule: null };
    expect(
      stripDay(input, { today: "2026-09-30", selected: "2026-09-30", count: 3, href }),
    ).toEqual({
      date: "2026-09-30",
      label: "Wed",
      count: 3,
      isToday: true,
      href: "/today",
    });
    expect(
      stripDay(
        { day: "2026-10-01", schedule: null },
        { today: "2026-09-30", selected: "2026-10-01", count: 0, href },
      ),
    ).toMatchObject({
      label: "Thu",
      isToday: false,
      selected: true,
      href: "/today?day=2026-10-01",
    });
  });
});

describe("opportunities and quick links", () => {
  it("lists programs whose next deadline comes after Due soon, soonest first, with their tag", () => {
    const list = upcomingOpportunities("2026-10-13", "2026-09-30");
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(4);
    const dates = list.map((o) => o.deadline.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d) => d > "2026-10-13")).toBe(true);
    for (const o of list) {
      expect(o.url).toMatch(/^https:\/\//);
      expect(o.office).toBeTruthy();
    }
  });

  it("ignores deadlines beyond the horizon and programs without one", () => {
    const program = {
      slug: "far",
      officeSlug: "matthews-center",
      name: "Far",
      url: "https://www.davidson.edu/x",
      description: "",
      amount: null,
      deadlineText: null,
      deadlines: [{ label: "Deadline", date: "2027-09-01" }],
      audience: null,
      source: "matthews-center",
      sources: ["https://www.davidson.edu/x"],
      verifiedAt: "2026-09-30",
    } satisfies Program;
    expect(upcomingOpportunities("2026-10-13", "2026-09-30", [program], () => undefined)).toEqual(
      [],
    );
    expect(
      upcomingOpportunities("2026-10-13", "2026-09-30", [{ ...program, deadlines: [] }]),
    ).toEqual([]);
  });

  it("quick links come from the curated links, platform links with their tag", () => {
    const links = quickLinks();
    expect(links.map((l) => l.slug)).toEqual([...QUICK_LINK_SLUGS]);
    expect(links.find((l) => l.slug === "handshake")?.source).toBe("handshake");
    expect(links.find((l) => l.slug === "davidson-one")?.source).toBe("davidson-one");
    expect(links.every((l) => l.url.startsWith("https://"))).toBe(true);
    expect(links.some((l) => /moodle/i.test(l.url))).toBe(false);
  });
});

describe("Today's dates and URL", () => {
  it("turns ET wall clock into instants across DST", () => {
    expect(zonedInstant("2026-11-01", "23:30").toISOString()).toBe("2026-11-02T04:30:00.000Z");
    const bounds = dayBounds("2026-11-01");
    expect((bounds.end.getTime() - bounds.start.getTime()) / 3_600_000).toBe(25);
    const spring = dayBounds("2027-03-14");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    expect(etClock("2026-11-02T04:30:00.000Z")).toBe("23:30");
  });

  it("accepts ?day= only for a day of the strip", () => {
    const days = stripDays("2026-09-30");
    expect(parseDayParam({ day: "2026-10-01" }, "2026-09-30", days)).toBe("2026-10-01");
    expect(parseDayParam({ day: ["2026-09-28", "x"] }, "2026-09-30", days)).toBe("2026-09-28");
    expect(parseDayParam({ day: "2026-10-09" }, "2026-09-30", days)).toBe("2026-09-30");
    expect(parseDayParam({ day: "2026-02-30" }, "2026-09-30", days)).toBe("2026-09-30");
    expect(parseDayParam({ day: "<script>" }, "2026-09-30", days)).toBe("2026-09-30");
    expect(parseDayParam({}, "2026-09-30", days)).toBe("2026-09-30");
  });

  it("reads the feeds once for the strip and today", () => {
    expect(feedRange("2026-10-03", stripDays("2026-10-03"))).toEqual({
      from: "2026-10-03",
      to: "2026-10-09",
    });
  });
});
