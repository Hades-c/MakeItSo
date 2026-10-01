import { describe, expect, it } from "vitest";
import {
  buildDaySummary,
  countWords,
  type DaySummaryInput,
  type SummaryClass,
} from "@/lib/day-summary";

/**
 * The Today h1 (PLAN §4.1.15): one deterministic sentence from the day's classes, deadlines, calendar milestones and
 * campus events, decided in America/New_York. One row per case the plan names (3-class weekday, no classes,
 * weekend, Fall Break, after last class, WebTree opens today, deadlines only, evening event, DST end 2026-11-01, not
 * onboarded, no sections chosen, pluralisation) plus the edges around them.
 */

/** ET wall clock on a 2026 EDT day (UTC−4). */
const edt = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00-04:00`);
/** ET wall clock on an EST day (UTC−5). */
const est = (hhmm: string, day: string) => new Date(`${day}T${hhmm}:00-05:00`);

/** Wednesday 2026-09-30: the mockup student's three MWF classes. */
const WEDNESDAY: SummaryClass[] = [
  { code: "CSC 221", start: edt("10:30"), end: edt("11:20") },
  { code: "ECO 232", start: edt("11:30"), end: edt("12:20") },
  { code: "ENV 237", start: edt("14:30"), end: edt("15:45") },
];

/** Monday 2026-10-12 (WebTree opens at 7 a.m.): the same student's Monday. */
const MONDAY_OCT_12: SummaryClass[] = [
  { code: "CSC 221", start: edt("10:30", "2026-10-12"), end: edt("11:20", "2026-10-12") },
  { code: "ECO 232", start: edt("11:30", "2026-10-12"), end: edt("12:20", "2026-10-12") },
  { code: "ENV 237", start: edt("14:30", "2026-10-12"), end: edt("15:45", "2026-10-12") },
];

const WEBTREE = { name: "WebTree", verb: "opens", at: edt("07:00", "2026-10-12") } as const;

interface Case {
  name: string;
  input: DaySummaryInput;
  sentence: string;
  facts?: Partial<ReturnType<typeof buildDaySummary>>;
}

const CASES: Case[] = [
  {
    name: "timed and all-day deadlines on day 3 count alike (by Davidson calendar day)",
    input: {
      now: edt("12:00"),
      hasSchedule: true,
      classes: [],
      noClasses: "no-classes-today",
      deadlines: [
        { title: "Essay", due: edt("09:00", "2026-10-03") },
        { title: "Lab", due: edt("13:00", "2026-10-03") },
      ],
    },
    sentence: "No classes today, and two deadlines in the next three days, the first Saturday.",
    facts: { deadlinesSoon: 2 },
  },
  {
    name: "a window reopening for the student, after its time",
    input: {
      now: edt("09:00", "2026-08-22"),
      hasSchedule: true,
      classes: [],
      noClasses: "weekend",
      milestones: [
        { name: "Banner Self-Service Add/Drop", verb: "reopens", at: edt("07:00", "2026-08-22") },
      ],
    },
    sentence:
      "No classes this weekend, and Banner Self-Service Add/Drop reopened today at 7:00 AM.",
    facts: { milestonesToday: 1 },
  },
  {
    name: "3-class weekday, before the first class",
    input: { now: edt("09:12"), hasSchedule: true, classes: WEDNESDAY },
    sentence:
      "Three classes today, starting with CSC 221 at 10:30 AM, and nothing is due in the next three days.",
    facts: { classesToday: 3, classesLeft: 3 },
  },
  {
    name: "3-class weekday, in class (the fixtures' noon)",
    input: { now: edt("12:00"), hasSchedule: true, classes: WEDNESDAY },
    sentence:
      "You're in ECO 232 until 12:20 PM, then one more class, and nothing is due in the next three days.",
    facts: { classesToday: 3, classesLeft: 2 },
  },
  {
    name: "3-class weekday, between classes",
    input: { now: edt("13:00"), hasSchedule: true, classes: WEDNESDAY },
    sentence:
      "One class left today, next ENV 237 at 2:30 PM, and nothing is due in the next three days.",
  },
  {
    name: "no classes on a class day",
    input: { now: edt("09:00"), hasSchedule: true, classes: [], noClasses: "no-classes-today" },
    sentence: "No classes today and nothing due in the next three days.",
    facts: { classesToday: 0 },
  },
  {
    name: "weekend, with a deadline on Monday",
    input: {
      now: edt("10:00", "2026-10-03"),
      hasSchedule: true,
      noClasses: "weekend",
      classes: WEDNESDAY,
      deadlines: [{ title: "Problem set", due: edt("09:00", "2026-10-05") }],
    },
    sentence: "No classes this weekend, and Problem set is due Monday.",
    facts: { classesToday: 0, deadlinesSoon: 1 },
  },
  {
    name: "Fall Break",
    input: {
      now: edt("11:00", "2026-09-21"),
      hasSchedule: true,
      noClasses: "break",
      breakName: "Fall Break",
    },
    sentence: "No classes today for Fall Break and nothing due in the next three days.",
  },
  {
    name: "after the last class",
    input: { now: edt("16:00"), hasSchedule: true, classes: WEDNESDAY },
    sentence: "Classes are done for today, and nothing is due in the next three days.",
    facts: { classesToday: 3, classesLeft: 0 },
  },
  {
    name: "WebTree opens today (before 7 a.m.)",
    input: {
      now: edt("06:30", "2026-10-12"),
      hasSchedule: true,
      classes: MONDAY_OCT_12,
      milestones: [WEBTREE],
      deadlines: [{ title: "Problem set", due: edt("23:59", "2026-10-13") }],
    },
    sentence:
      "Three classes today, starting with CSC 221 at 10:30 AM, and WebTree opens today at 7:00 AM.",
    facts: { milestonesToday: 1, deadlinesSoon: 1 },
  },
  {
    name: "WebTree opened earlier today",
    input: {
      now: edt("12:00", "2026-10-12"),
      hasSchedule: true,
      classes: MONDAY_OCT_12,
      milestones: [WEBTREE],
    },
    sentence:
      "You're in ECO 232 until 12:20 PM, then one more class, and WebTree opened today at 7:00 AM.",
  },
  {
    name: "a milestone of another day is not today's",
    input: {
      now: edt("09:00", "2026-10-11"),
      hasSchedule: true,
      noClasses: "weekend",
      milestones: [WEBTREE],
    },
    sentence: "No classes this weekend and nothing due in the next three days.",
    facts: { milestonesToday: 0 },
  },
  {
    name: "an all-day milestone (no published time)",
    input: {
      now: edt("09:00", "2026-11-20"),
      hasSchedule: true,
      noClasses: "no-classes-today",
      milestones: [{ name: "Thanksgiving Break", verb: "begins", at: null, day: "2026-11-20" }],
    },
    sentence: "No classes today, and Thanksgiving Break begins today.",
  },
  {
    name: "deadlines only (no schedule yet)",
    input: {
      now: edt("09:00"),
      hasSchedule: false,
      deadlines: [
        { title: "Response paper", due: edt("17:00", "2026-10-02") },
        { title: "Problem set", due: edt("23:59", "2026-10-01") },
      ],
    },
    sentence: "Two deadlines in the next three days, the first tomorrow at 11:59 PM.",
    facts: { deadlinesSoon: 2 },
  },
  {
    name: "an all-day deadline names the day without a time",
    input: {
      now: edt("12:00"),
      hasSchedule: false,
      deadlines: [
        {
          title: "Minor Declaration Deadline for Seniors",
          due: edt("12:00", "2026-10-01"),
          allDay: true,
        },
      ],
    },
    sentence: "Minor Declaration Deadline for Seniors is due tomorrow.",
  },
  {
    name: "an all-day deadline today still counts after noon",
    input: {
      now: edt("20:00"),
      hasSchedule: true,
      classes: WEDNESDAY,
      deadlines: [{ title: "Fee grant application", due: edt("12:00"), allDay: true }],
    },
    sentence: "Classes are done for today, and Fee grant application is due today.",
  },
  {
    name: "evening event",
    input: {
      now: edt("16:00"),
      hasSchedule: true,
      classes: WEDNESDAY,
      events: [
        { title: "Club open house", start: edt("19:00") },
        { title: "Yesterday's talk", start: edt("19:00", "2026-09-29") },
      ],
    },
    sentence: "Classes are done for today, and Club open house is at 7:00 PM.",
    facts: { eventsLeftToday: 1 },
  },
  {
    name: "several evening events",
    input: {
      now: edt("16:00"),
      hasSchedule: true,
      classes: WEDNESDAY,
      events: [
        { title: "Open mic", start: edt("21:00") },
        { title: "Club open house", start: edt("19:00") },
        { title: "Dinner talk", start: edt("17:30") },
        { title: "Morning yoga", start: edt("07:00") },
      ],
    },
    sentence:
      "Classes are done for today, and three campus events later today, starting at 5:30 PM.",
  },
  {
    name: "DST end 2026-11-01: a deadline late on the 25-hour day is still today",
    input: {
      now: edt("00:30", "2026-11-01"),
      hasSchedule: true,
      noClasses: "weekend",
      deadlines: [{ title: "Graduation application", due: est("23:30", "2026-11-01") }],
    },
    sentence: "No classes this weekend, and Graduation application is due today at 11:30 PM.",
  },
  {
    name: "DST end 2026-11-01: after the change, half past midnight is tomorrow",
    input: {
      now: est("23:00", "2026-11-01"),
      hasSchedule: true,
      noClasses: "weekend",
      classes: [
        { code: "CSC 221", start: est("10:30", "2026-11-02"), end: est("11:20", "2026-11-02") },
      ],
      deadlines: [{ title: "Lab report", due: est("00:30", "2026-11-02") }],
    },
    sentence: "No classes this weekend, and Lab report is due tomorrow at 12:30 AM.",
    facts: { classesToday: 0 },
  },
  {
    name: "DST end: the Monday after keeps its EST class times",
    input: {
      now: est("08:00", "2026-11-02"),
      hasSchedule: true,
      classes: [
        { code: "CSC 221", start: est("10:30", "2026-11-02"), end: est("11:20", "2026-11-02") },
      ],
    },
    sentence:
      "One class today, starting with CSC 221 at 10:30 AM, and nothing is due in the next three days.",
  },
  {
    name: "DST start 2027-03-14: a Monday class is not Sunday's",
    input: {
      now: edt("22:00", "2027-03-14"),
      hasSchedule: true,
      noClasses: "weekend",
      classes: [
        { code: "ECO 232", start: edt("09:30", "2027-03-15"), end: edt("10:20", "2027-03-15") },
      ],
    },
    sentence: "No classes this weekend and nothing due in the next three days.",
  },
  {
    name: "not onboarded",
    input: { now: edt("09:00"), hasSchedule: true, onboarded: false, classes: WEDNESDAY },
    sentence: "Finish setting up MakeItSo to see your classes, deadlines and campus events here.",
  },
  {
    name: "not onboarded, on the day WebTree opens",
    input: {
      now: edt("06:00", "2026-10-12"),
      hasSchedule: true,
      onboarded: false,
      milestones: [WEBTREE],
    },
    sentence:
      "WebTree opens today at 7:00 AM; finish setting up MakeItSo to see your classes here.",
  },
  {
    name: "no sections chosen",
    input: {
      now: edt("09:00"),
      hasSchedule: true,
      noClasses: "no-sections",
      termLabel: "Fall 2026",
    },
    sentence:
      "No Fall 2026 class sections in your plan yet and nothing due in the next three days.",
  },
  {
    name: "no sections chosen, with a deadline",
    input: {
      now: edt("09:00"),
      hasSchedule: true,
      noClasses: "no-sections",
      termLabel: "Fall 2026",
      deadlines: [{ title: "Advising form", courseCode: "CSC 221", due: edt("15:00") }],
    },
    sentence:
      "No Fall 2026 class sections in your plan yet, and Advising form (CSC 221) is due today at 3:00 PM.",
  },
  {
    name: "pluralisation: one class, one more class",
    input: {
      now: edt("10:45"),
      hasSchedule: true,
      classes: WEDNESDAY.slice(0, 2),
    },
    sentence:
      "You're in CSC 221 until 11:20 AM, then one more class, and nothing is due in the next three days.",
  },
  {
    name: "pluralisation: a dozen classes in digits",
    input: {
      now: edt("07:00"),
      hasSchedule: true,
      classes: Array.from({ length: 12 }, (_, i) => ({
        code: `MUS ${100 + i}`,
        start: edt(`${String(8 + i).padStart(2, "0")}:00`),
        end: edt(`${String(8 + i).padStart(2, "0")}:50`),
      })),
    },
    sentence:
      "12 classes today, starting with MUS 100 at 8:00 AM, and nothing is due in the next three days.",
  },
  {
    name: "nothing at all",
    input: { now: edt("09:00"), hasSchedule: false },
    sentence: "Nothing on your calendar yet.",
  },
];

describe("buildDaySummary (W7 table)", () => {
  it("covers at least the twelve cases the plan names", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(12);
  });

  it.each(CASES)("$name", ({ input, sentence, facts }) => {
    const summary = buildDaySummary(input);
    expect(summary.sentence).toBe(sentence);
    if (facts) expect(summary).toMatchObject(facts);
    // One sentence: capitalised, one final full stop, deterministic.
    expect(summary.sentence).toMatch(/^[A-Z0-9].*\.$/);
    expect(buildDaySummary(input)).toEqual(summary);
  });

  it("ignores past and distant deadlines and sorts all-day ones first on their day", () => {
    const s = buildDaySummary({
      now: edt("12:00"),
      hasSchedule: false,
      deadlines: [
        { title: "Late", due: edt("08:00") },
        { title: "Far away", due: edt("12:00", "2026-10-09") },
        { title: "Timed", due: edt("09:00", "2026-10-01") },
        { title: "All day", due: edt("12:00", "2026-10-01"), allDay: true },
      ],
    });
    expect(s.deadlinesSoon).toBe(2);
    expect(s.sentence).toBe("Two deadlines in the next three days, the first tomorrow.");
  });

  it("puts a milestone ahead of deadlines and events", () => {
    const s = buildDaySummary({
      now: edt("06:00", "2026-10-12"),
      hasSchedule: false,
      milestones: [WEBTREE],
      deadlines: [{ title: "Problem set", due: edt("23:59", "2026-10-12") }],
      events: [{ title: "Talk", start: edt("19:00", "2026-10-12") }],
    });
    expect(s.sentence).toBe("WebTree opens today at 7:00 AM.");
    expect(s).toMatchObject({ deadlinesSoon: 1, eventsLeftToday: 1, milestonesToday: 1 });
  });
});

describe("countWords", () => {
  it.each([
    [0, "no classes"],
    [1, "one class"],
    [2, "two classes"],
    [9, "nine classes"],
    [10, "10 classes"],
    [12, "12 classes"],
  ])("%i → %s", (n, text) => {
    expect(countWords(n, "class", "classes")).toBe(text);
  });

  it("adds an s by default", () => {
    expect(countWords(1, "deadline")).toBe("one deadline");
    expect(countWords(3, "deadline")).toBe("three deadlines");
  });
});
