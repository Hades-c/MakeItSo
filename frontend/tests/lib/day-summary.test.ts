import { describe, expect, it } from "vitest";
import { buildDaySummary, type SummaryClass } from "@/lib/day-summary";

// Wednesday 2026-09-30 in Davidson (EDT, UTC−4). Helper: local ET wall-clock time → Date.
const et = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00-04:00`);

const CLASSES: SummaryClass[] = [
  { code: "CSC 221", start: et("10:30"), end: et("11:20") },
  { code: "ECO 232", start: et("11:30"), end: et("12:20") },
  { code: "ENV 237", start: et("14:30"), end: et("15:45") },
  // Tomorrow: never counted today.
  { code: "ENG 260", start: et("09:40", "2026-10-01"), end: et("10:55", "2026-10-01") },
];

describe("buildDaySummary", () => {
  it("says so when there is nothing to summarise yet", () => {
    const s = buildDaySummary({ now: et("09:12"), hasSchedule: false });
    expect(s.sentence).toBe("Nothing on your calendar yet.");
    expect(s.classesToday).toBe(0);
  });

  it("leads with today's classes and the next one", () => {
    const s = buildDaySummary({ now: et("09:12"), hasSchedule: true, classes: CLASSES });
    expect(s.sentence).toBe(
      "Three classes today, starting with CSC 221 at 10:30 AM, and nothing is due in the next three days.",
    );
    expect(s).toMatchObject({ classesToday: 3, classesLeft: 3 });
  });

  it("names a single upcoming deadline with its course and day", () => {
    const s = buildDaySummary({
      now: et("09:12"),
      hasSchedule: true,
      classes: CLASSES,
      deadlines: [{ title: "Problem set", courseCode: "CSC 221", due: et("23:59", "2026-10-01") }],
    });
    expect(s.sentence).toBe(
      "Three classes today, starting with CSC 221 at 10:30 AM, and Problem set (CSC 221) is due tomorrow at 11:59 PM.",
    );
  });

  it("counts several deadlines and ignores past or distant ones", () => {
    const s = buildDaySummary({
      now: et("12:00"),
      hasSchedule: true,
      classes: CLASSES,
      deadlines: [
        { title: "Late", due: et("08:00") },
        { title: "Response paper", due: et("17:00", "2026-10-02") },
        { title: "Problem set", due: et("23:59", "2026-10-01") },
        { title: "Far away", due: et("12:00", "2026-10-09") },
      ],
    });
    expect(s.deadlinesSoon).toBe(2);
    expect(s.sentence).toBe(
      "You're in ECO 232 until 12:20 PM, then one more class, and two deadlines in the next three days, the first tomorrow at 11:59 PM.",
    );
  });

  it("uses the weekday for deadlines two or more days out", () => {
    const s = buildDaySummary({
      now: et("12:30"),
      hasSchedule: true,
      classes: CLASSES,
      deadlines: [{ title: "Response paper", due: et("17:00", "2026-10-02") }],
    });
    expect(s.sentence).toBe(
      "One class left today, next ENV 237 at 2:30 PM, and Response paper is due Friday.",
    );
  });

  it("mentions a campus event when nothing is due", () => {
    const s = buildDaySummary({
      now: et("16:00"),
      hasSchedule: true,
      classes: CLASSES,
      events: [
        { title: "Career & internship fair", start: et("16:30") },
        { title: "Yesterday's talk", start: et("16:30", "2026-09-29") },
      ],
    });
    expect(s.sentence).toBe(
      "Classes are done for today, and Career & internship fair is at 4:30 PM.",
    );
    expect(s.eventsLeftToday).toBe(1);
  });

  it("handles a day with no classes", () => {
    const saturday = new Date("2026-10-03T14:00:00Z");
    expect(buildDaySummary({ now: saturday, hasSchedule: true, classes: CLASSES }).sentence).toBe(
      "No classes today and nothing due in the next three days.",
    );
  });

  it("works from deadlines alone before a schedule exists", () => {
    const s = buildDaySummary({
      now: et("09:00"),
      hasSchedule: false,
      deadlines: [{ title: "Advising appointment", due: et("15:00") }],
    });
    expect(s.sentence).toBe("Advising appointment is due today at 3:00 PM.");
  });

  it("decides 'today' in Davidson time even when the server runs in UTC", () => {
    // 11:00 PM ET on Sep 30 is 03:00 UTC on Oct 1: the ENG 260 class tomorrow morning is not "today".
    const s = buildDaySummary({ now: et("23:00"), hasSchedule: true, classes: CLASSES });
    expect(s.classesToday).toBe(3);
    expect(s.sentence).toBe(
      "Classes are done for today, and nothing is due in the next three days.",
    );
  });

  it("is deterministic", () => {
    const input = { now: et("09:12"), hasSchedule: true, classes: CLASSES };
    expect(buildDaySummary(input)).toEqual(buildDaySummary(input));
  });
});
