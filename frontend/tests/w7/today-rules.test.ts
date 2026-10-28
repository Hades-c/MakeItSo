import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/lib/types/feeds";
import type { DayScheduleEntry, StudentDeadline } from "@/lib/types/plan";
import type { Program } from "@/lib/types/content";
import { deadlinesBetween } from "@/server/content/deadlines";
import {
  agendaWindow,
  audienceIncludes,
  breakOn,
  buildAgenda,
  buildDueSoon,
  dayBounds,
  dueForYouCount,
  dueLabel,
  dueSoonRange,
  etClock,
  groupDueSoon,
  MAX_TIMELINE_EVENTS,
  pickShown,
  pickTimelineEvents,
  quickLinks,
  QUICK_LINK_SLUGS,
  stripCount,
  stripDay,
  stripDays,
  upcomingOpportunities,
  zonedInstant,
} from "@/server/today";
import { feedRange, parseDayParam, todayHref } from "@/app/(hub)/today/_lib/params";

/**
 * The pure rules behind /today (PLAN §3, §5 Dates/times and Sources): the academic calendar reading (breaks and
 * audiences), the timeline's items and hours, Due soon, the week strip, opportunities and quick links, and the
 * URL's ?day=. No database.
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
});

describe("the timeline's items and hours", () => {
  it("draws classes, the student's and the calendar's timed deadlines, and a few events", () => {
    const agenda = buildAgenda({
      day: "2026-09-30",
      schedule: {
        entries: [
          entry(),
          entry({
            crn: "10230",
            courseCode: "ENV 237",
            start: "14:30",
            end: "15:45",
            startsAt: edt("14:30").toISOString(),
            endsAt: edt("15:45").toISOString(),
            kind: "lab",
          }),
        ],
      },
      studentDeadlines: [
        deadline({ courseCode: "CSC 221" }),
        deadline({ title: "Tomorrow", dueAt: edt("09:00", "2026-10-01").toISOString() }),
      ],
      contentDeadlines: deadlinesBetween("2026-09-30", "2026-09-30"),
      standing: "first-year",
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
    // b (3–4p) and the open-ended d (3p, counted as 2 h) overlap ENV 237; e lasts 12 h: all three are counted in
    // "3 more campus events", none is dropped. The feed deadline g uses none of the events' budget.
    expect(agenda.moreEvents).toBe(3);
    expect(agenda.allDay).toEqual([]);
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

  it("puts a calendar deadline's published time on the line, with its stored source", () => {
    const agenda = buildAgenda({
      day: "2026-11-03",
      schedule: { entries: [] },
      studentDeadlines: [],
      contentDeadlines: deadlinesBetween("2026-11-03", "2026-11-03"),
      standing: "first-year",
      feedItems: [],
    });
    expect(agenda.items).toEqual([
      {
        id: "content-calendar:f26-webtree-closes",
        kind: "deadline",
        title: "WebTree Closes (Spring 2027 Preferences Due)",
        start: "17:00",
        source: "registrar",
      },
    ]);
  });

  it.each([
    ["2026-10-12", "WebTree opens"],
    ["2026-11-06", "schedules available"],
    ["2026-11-09", "Banner add/drop opens"],
  ])("never draws a registration row as a deadline (%s, %s)", (day) => {
    const agenda = buildAgenda({
      day,
      schedule: { entries: [] },
      studentDeadlines: [],
      contentDeadlines: deadlinesBetween(day, day),
      standing: "first-year",
      feedItems: [],
    });
    expect(agenda.items.filter((item) => item.id.startsWith("content-calendar:"))).toEqual([]);
    expect(agenda.allDay).toEqual([]);
  });

  it("lists the day's all-day deadlines for the student with the timeline", () => {
    const input = {
      day: "2026-10-01",
      schedule: { entries: [] },
      studentDeadlines: [],
      contentDeadlines: deadlinesBetween("2026-10-01", "2026-10-01"),
      feedItems: [],
    };
    const senior = buildAgenda({ ...input, standing: "senior" });
    expect(senior.items).toEqual([]);
    expect(senior.allDay).toEqual([
      {
        id: "content-calendar:f26-minor-declaration",
        title: "Minor Declaration Deadline for Seniors",
        source: "registrar",
        url: expect.stringMatching(/^https:\/\//),
      },
    ]);
    expect(buildAgenda({ ...input, standing: "first-year" }).allDay).toEqual([]);
  });

  it("counts an open-ended event as 2 h and never draws one over a class", () => {
    const classes = [{ start: edt("14:30").getTime(), end: edt("15:45").getTime() }];
    const items = [
      feed({ id: "open", startsAt: edt("12:00").toISOString(), endsAt: null }),
      feed({ id: "late", startsAt: edt("13:00").toISOString(), endsAt: null }),
      feed({ id: "after", startsAt: edt("16:00").toISOString(), endsAt: null }),
    ];
    const picked = pickTimelineEvents("2026-09-30", items, edt("09:00"), classes);
    // "late" runs 1–3 PM (2 h) into the 2:30 class.
    expect(picked.shown.map((e) => e.id)).toEqual(["open", "after"]);
    expect(picked.more).toBe(1);
    const agenda = buildAgenda({
      day: "2026-09-30",
      schedule: { entries: [] },
      studentDeadlines: [],
      contentDeadlines: [],
      standing: null,
      feedItems: [items[0]!],
    });
    expect(agenda.items[0]).toMatchObject({ kind: "event", start: "12:00", end: "14:00" });
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
    expect(kinds).toEqual(new Set(["deadline", "registration", "program", "student"]));
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
    expect(webtree).toMatchObject({ kind: "registration", forYou: true, endDay: "2026-11-03" });
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

  it("lists the student's rows first, then every other row by date, and holds none back", () => {
    const items = buildDueSoon({
      now,
      standing: "first-year",
      contentDeadlines: content,
      studentDeadlines: [deadline({ dueAt: edt("12:00", "2026-10-13").toISOString() })],
    });
    expect(items.length).toBeGreaterThan(4);
    const { forYou, also, more } = groupDueSoon(items, 4);
    // For the student: their own deadline and the WebTree window (no audience), never the seniors' minor
    // declaration, which waits under "Also in the next two weeks".
    expect(forYou.every((i) => i.forYou)).toBe(true);
    expect(forYou.map((i) => i.id)).toEqual(
      expect.arrayContaining(["calendar:f26-webtree-spring27", `student:${ID}`]),
    );
    expect([...also, ...more].every((i) => !i.forYou)).toBe(true);
    expect([...also, ...more].map((i) => i.id)).toContain("calendar:f26-minor-declaration");
    // One count: the header and the card both count exactly the rows listed for the student.
    expect(dueForYouCount(items)).toBe(forYou.length);
    // Every row is in exactly one group, and each group keeps the list's date order.
    expect([...forYou, ...also, ...more].map((i) => i.id).sort()).toEqual(
      items.map((i) => i.id).sort(),
    );
    for (const group of [forYou, [...also, ...more]]) {
      const at = group.map((i) => items.indexOf(i));
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
    // At most 4 rows show at first, the student's always included; the rest are one press away.
    expect(forYou.length + also.length).toBe(Math.max(4, forYou.length));
    expect(pickShown(items, 4)).toEqual([...forYou, ...also]);
    expect(pickShown(items, 100)).toHaveLength(items.length);
    const tight = groupDueSoon(items, 1);
    expect(tight.forYou).toEqual(forYou);
    expect(tight.also).toEqual([]);
    expect(tight.more).toHaveLength(items.length - forYou.length);
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
    const curated = deadlinesBetween("2026-09-28", "2026-10-16");
    expect(stripCount({ day: "2026-09-30", schedule }, [deadline()], curated, "first-year")).toBe(
      3,
    );
    // Oct 1: the seniors' minor declaration deadline (all day: listed with that day's timeline too).
    expect(stripCount({ day: "2026-10-01", schedule: null }, [], curated, "senior")).toBe(1);
    expect(stripCount({ day: "2026-10-01", schedule: null }, [], curated, "first-year")).toBe(0);
    // Oct 12: WebTree opens; a registration opening is not a deadline.
    expect(stripCount({ day: "2026-10-12", schedule: null }, [], curated, "first-year")).toBe(0);
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
    const list = upcomingOpportunities("2026-10-13", "2026-09-30", "first-year");
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
    expect(
      upcomingOpportunities("2026-10-13", "2026-09-30", null, [program], () => undefined),
    ).toEqual([]);
    expect(
      upcomingOpportunities("2026-10-13", "2026-09-30", null, [{ ...program, deadlines: [] }]),
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
