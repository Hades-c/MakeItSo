import { describe, expect, it, vi } from "vitest";
import type { FeedItem } from "@/lib/types/feeds";
import type { StudentDeadline } from "@/lib/types/plan";
import { getProgram } from "@/server/content/offices";
import { deadlinesBetween } from "@/server/content/deadlines";
import { MissingFixtureError } from "@/server/http/fixtures";
import {
  audienceIncludes,
  buildDueSoon,
  calendarCategoryOf,
  milestonesOn,
  mondayOf,
  nextUpLabel,
  ownDeadlineCount,
  pickCampusEvents,
  safely,
  summaryInput,
  todaySummary,
  upcomingOpportunities,
} from "@/server/today";

/**
 * Regression tests for the W7 review: audiences read conservatively, milestones per class year, registration rows
 * never counted or drawn as deadlines, the "next up" label said from the real today, the header's deadline count,
 * one event rule for the h1 and the timeline, This week on campus without long-running items, opportunities'
 * audiences and the pure-computation guard.
 */

const edt = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00-04:00`);
const NOON = edt("12:00");
const TZ = "America/New_York";

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

describe("audienceIncludes on the real curated audiences", () => {
  const ALL = ["incoming", "first-year", "sophomore", "junior", "senior"] as const;
  it.each([
    // [audience, which standings it certainly includes]
    ["All students", ALL],
    ["Current students", ALL],
    ["Davidson students", ALL],
    ["Currently enrolled Davidson students", ALL],
    ["Students of all majors", ALL],
    ["All students and alumni", ALL],
    ["Students, faculty and staff", ALL],
    ["Sophomores, juniors, and seniors", ["sophomore", "junior", "senior"]],
    ["First-years, sophomores and juniors", ["incoming", "first-year", "sophomore", "junior"]],
    ["Seniors (Class of 2027)", ["senior"]],
    ["Non-seniors", ["incoming", "first-year", "sophomore", "junior"]],
    ["All non-seniors", ["incoming", "first-year", "sophomore", "junior"]],
    ["New students", ["incoming", "first-year"]],
    ["Continuing students", ["first-year", "sophomore", "junior", "senior"]],
    ["Seniors and alumni who are citizens of any country outside the UK", []],
    // Conditional: split by term, "rising" years, plans, citizenship, interests.
    [
      "All students: first-years in spring; sophomores and juniors in fall or spring; seniors in fall",
      [],
    ],
    [
      "Rising sophomores, juniors and seniors (preference to more senior students), any major; minimum GPA 2.5",
      [],
    ],
    ["Sophomores and juniors planning health-science careers (previous research preferred)", []],
    ["Sophomores (U.S. citizens)", []],
    ["Students planning a January graduation", []],
    [
      "Seniors and bachelor's holders not yet in a graduate degree program (U.S. citizens, nationals, permanent residents)",
      [],
    ],
    ["Graduating seniors (Class of 2027)", []],
    ["Students with financial need", []],
    ["Faculty", []],
    ["Faculty and staff (college offices closed)", []],
  ] as const)("%j", (audience, included) => {
    for (const standing of ALL) {
      expect(audienceIncludes(audience, standing), `${audience} / ${standing}`).toBe(
        (included as readonly string[]).includes(standing),
      );
    }
    // Without a known standing only an every-student audience is certain.
    expect(audienceIncludes(audience, null)).toBe(included === ALL);
  });
});

describe("milestones per class year", () => {
  it("names Banner add/drop for sophomores–seniors only, and keeps 'reopens'", () => {
    expect(milestonesOn("2026-08-03", "first-year")).toEqual([]);
    expect(milestonesOn("2026-08-03", "junior").map((m) => `${m.name} ${m.verb}`)).toEqual([
      "Banner Self-Service Add/Drop for Sophomores, Juniors, and Seniors opens",
    ]);
    expect(milestonesOn("2026-08-22", "incoming")).toEqual([]);
    expect(milestonesOn("2026-08-22", "sophomore").map((m) => `${m.name} ${m.verb}`)).toEqual([
      "Banner Self-Service Add/Drop reopens",
    ]);
  });

  it("names WebTree for every class year, and the Fall 2027 window only for continuing students", () => {
    for (const standing of ["first-year", "senior"] as const) {
      expect(milestonesOn("2026-10-12", standing).map((m) => m.name)).toEqual(["WebTree"]);
    }
    const fall27 = milestonesOn("2027-03-15", "first-year").map((m) => m.name);
    expect(fall27.some((name) => /webtree/i.test(name))).toBe(true);
    expect(milestonesOn("2027-03-15", "incoming").some((m) => /webtree/i.test(m.name))).toBe(false);
  });

  it("says 'reopened' once the time has passed", () => {
    const summary = todaySummary({
      now: edt("09:00", "2026-08-22"),
      onboarded: true,
      standing: "junior",
      schedule: { entries: [], empty: "weekend", termCode: "202601" },
      termLabel: "Fall 2026",
      studentDeadlines: [],
      feedItems: [],
    });
    expect(summary.sentence).toBe(
      "No classes this weekend, and Banner Self-Service Add/Drop reopened today at 7:00 AM.",
    );
  });
});

describe("registration rows are not deadlines", () => {
  const from = "2026-09-30";
  const to = "2026-11-13";
  it("knows each curated row's calendar category", () => {
    const rows = deadlinesBetween(from, to);
    const webtree = rows.find((r) => r.id === "calendar:f26-webtree-spring27");
    expect(webtree && calendarCategoryOf(webtree)).toBe("registration");
    const closes = rows.find((r) => r.id === "calendar:f26-webtree-closes");
    expect(closes && calendarCategoryOf(closes)).toBe("deadline");
    const program = rows.find((r) => r.kind === "program");
    expect(program && calendarCategoryOf(program)).toBeNull();
  });

  it("gives registration rows their own kind in Due soon, windows and single days alike", () => {
    const items = buildDueSoon({
      now: edt("12:00", "2026-11-02"),
      standing: "first-year",
      contentDeadlines: deadlinesBetween("2026-11-02", "2026-11-15"),
      studentDeadlines: [],
    });
    const kind = (title: RegExp) => items.find((i) => title.test(i.title))?.kind;
    expect(kind(/^WebTree Open/)).toBe("registration");
    expect(kind(/Schedules Available/)).toBe("registration");
    expect(kind(/^Banner Self-Service Add\/Drop \(Spring 2027\)/)).toBe("registration");
    expect(kind(/^WebTree Closes/)).toBe("deadline");
  });

  it("counts only the student's deadlines in the header: no windows, no optional applications", () => {
    const studentDeadlines: StudentDeadline[] = [
      {
        id: "64b7f0a1c2d3e4f5a6b7c8d9",
        title: "Problem set",
        dueAt: edt("23:59").toISOString(),
      },
    ];
    const items = buildDueSoon({
      now: NOON,
      standing: "first-year",
      contentDeadlines: deadlinesBetween("2026-09-30", "2026-10-13"),
      studentDeadlines,
    });
    // The list has the WebTree window and program deadlines…
    expect(items.some((i) => i.kind === "registration")).toBe(true);
    expect(items.some((i) => i.kind === "program")).toBe(true);
    // …but only the problem set is the first-year's deadline in the next two weeks.
    expect(ownDeadlineCount(items)).toBe(1);
    const senior = buildDueSoon({
      now: NOON,
      standing: "senior",
      contentDeadlines: deadlinesBetween("2026-09-30", "2026-10-13"),
      studentDeadlines,
    });
    expect(ownDeadlineCount(senior)).toBe(2); // + Minor Declaration Deadline for Seniors
  });
});

describe("the timeline's next-up label, from the real today", () => {
  const at = edt("10:30", "2026-10-02").toISOString();
  it.each([
    ["2026-10-01", "2026-09-30", "Tomorrow 10:30 AM"],
    ["2026-10-02", "2026-09-30", "Fri 10:30 AM"],
    // Viewing Thursday from Wednesday: Friday is two days away, not "Tomorrow".
    ["2026-10-02", "2026-09-30", "Fri 10:30 AM"],
    ["2026-10-05", "2026-10-02", "Mon, Oct 5 10:30 AM"],
    ["2026-10-07", "2026-09-30", "Wed, Oct 7 10:30 AM"],
  ])("%s seen on %s → %s", (day, today, expected) => {
    const startsAt = new Date(`${day}T10:30:00-04:00`).toISOString();
    expect(nextUpLabel(day, today, startsAt, TZ)).toBe(expected);
  });

  it("is null for today or a day already past", () => {
    expect(nextUpLabel("2026-09-29", "2026-09-30", at, TZ)).toBeNull();
    expect(nextUpLabel("2026-09-30", "2026-09-30", at, TZ)).toBeNull();
  });

  it("weeks run Monday to Sunday", () => {
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });
});

describe("one event rule for the h1 and the timeline", () => {
  it("counts open-ended and long events today, never feed deadlines or other days", () => {
    const input = summaryInput({
      now: NOON,
      onboarded: true,
      standing: "first-year",
      schedule: { entries: [], empty: "no-classes-today", termCode: "202601" },
      termLabel: "Fall 2026",
      studentDeadlines: [],
      feedItems: [
        feed({ id: "open", startsAt: edt("19:00").toISOString(), endsAt: null }),
        feed({
          id: "long",
          startsAt: edt("13:00").toISOString(),
          endsAt: edt("20:00").toISOString(),
        }),
        feed({
          id: "deadline",
          kind: "deadline",
          startsAt: edt("17:00").toISOString(),
          endsAt: null,
        }),
        feed({ id: "allday", allDay: true }),
        feed({ id: "tomorrow", startsAt: edt("19:00", "2026-10-01").toISOString() }),
      ],
    });
    expect(input.events?.map((e) => e.title)).toEqual(["Event open", "Event long"]);
  });
});

describe("the h1's three-day window", () => {
  it("counts a timed deadline by calendar day, like an all-day one", () => {
    const summary = todaySummary({
      now: NOON,
      onboarded: true,
      standing: "first-year",
      schedule: { entries: [], empty: "no-classes-today", termCode: "202601" },
      termLabel: "Fall 2026",
      studentDeadlines: [
        {
          id: "64b7f0a1c2d3e4f5a6b7c8d1",
          title: "Essay",
          dueAt: edt("09:00", "2026-10-03").toISOString(),
        },
        {
          id: "64b7f0a1c2d3e4f5a6b7c8d2",
          title: "Lab",
          dueAt: edt("13:00", "2026-10-03").toISOString(),
        },
      ],
      feedItems: [],
    });
    expect(summary.deadlinesSoon).toBe(2);
    expect(summary.sentence).toBe(
      "No classes today, and two deadlines in the next three days, the first Saturday.",
    );
  });
});

describe("This week on campus", () => {
  it("leaves out long-running items already under way, keeps the week's dated events", () => {
    const now = NOON;
    const items = [
      feed({
        id: "rhodes",
        startsAt: edt("09:00", "2026-07-23").toISOString(),
        endsAt: edt("17:00", "2026-10-01").toISOString(),
      }),
      feed({
        id: "course",
        startsAt: edt("18:00", "2026-09-23").toISOString(),
        endsAt: edt("20:00", "2026-11-12").toISOString(),
      }),
      feed({ id: "tonight", startsAt: edt("19:00").toISOString(), endsAt: null }),
      feed({
        id: "since-morning",
        startsAt: edt("08:00").toISOString(),
        endsAt: edt("17:00").toISOString(),
      }),
      feed({ id: "friday", startsAt: edt("12:00", "2026-10-02").toISOString() }),
      feed({
        id: "festival",
        startsAt: edt("10:00", "2026-10-03").toISOString(),
        endsAt: edt("18:00", "2026-10-05").toISOString(),
      }),
    ];
    expect(pickCampusEvents(items, now, 5).map((i) => i.id)).toEqual([
      "since-morning",
      "tonight",
      "friday",
      "festival",
    ]);
    expect(pickCampusEvents(items, now, 2).map((i) => i.id)).toEqual(["since-morning", "tonight"]);
  });
});

describe("opportunities' audiences", () => {
  it("says who a program is for when it is not certainly the student", () => {
    const list = upcomingOpportunities("2026-10-13", "2026-09-30", "first-year");
    for (const o of list) {
      const program = getProgram(o.slug);
      expect(o.audience).toBe(program?.audience ?? null);
      expect(o.forYou).toBe(audienceIncludes(program?.audience ?? null, "first-year"));
    }
    expect(list.some((o) => !o.forYou && o.audience)).toBe(true);
  });
});

describe("safely", () => {
  it("turns a throw into null and logs it, but never hides a missing fixture", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(safely("x", () => 1)).toBe(1);
    expect(
      safely("x", () => {
        throw new Error("boom");
      }),
    ).toBeNull();
    expect(log).toHaveBeenCalled();
    expect(() =>
      safely("x", () => {
        throw new MissingFixtureError("course-schedule", "GET", "https://example.invalid/");
      }),
    ).toThrow(MissingFixtureError);
    log.mockRestore();
  });
});
