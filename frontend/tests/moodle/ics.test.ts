import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOODLE_DUE_WINDOW_DAYS,
  MOODLE_MAX_EVENTS,
  MoodleFeedError,
  parseMoodleCalendar,
} from "@/server/moodle/ics";

/** server/moodle/ics.ts on the synthetic Moodle exports in tests/fixtures/external/course-site. */

const DIR = path.join(process.cwd(), "tests", "fixtures", "external", "course-site");
const NOW = new Date("2026-09-30T12:00:00-04:00");
const fixture = (name: string) => readFileSync(path.join(DIR, name), "utf8");

function problemOf(text: string): string | null {
  try {
    parseMoodleCalendar(text, NOW);
    return null;
  } catch (error) {
    return error instanceof MoodleFeedError ? error.problem : `threw ${String(error)}`;
  }
}

describe("parseMoodleCalendar", () => {
  it("keeps UID, title, due time and course name only, upcoming first", () => {
    const { events, skipped, capped } = parseMoodleCalendar(fixture("export.ics"), NOW);
    expect({ skipped, capped }).toEqual({ skipped: 0, capped: 0 });
    expect(events).toEqual([
      {
        uid: "90001@moodle.davidson.edu",
        title: "Problem set 3",
        dueAt: "2026-10-02T03:59:00.000Z",
        category: "CSC221-A-F26",
      },
      {
        uid: "90004@moodle.davidson.edu",
        title: "Response paper 2",
        dueAt: "2026-10-03T03:00:00.000Z",
        category: "ENG260-B-F26",
      },
      {
        uid: "90003@moodle.davidson.edu",
        title: "Quiz 2 closes",
        dueAt: "2026-10-06T03:59:00.000Z",
        category: "CSC221-A-F26",
      },
      // A date without a time: 23:59 Davidson time that day.
      {
        uid: "90011@moodle.davidson.edu",
        title: "Reading journal",
        dueAt: "2026-10-09T03:59:00.000Z",
        category: "ENG260-B-F26",
      },
      {
        uid: "90006@moodle.davidson.edu",
        title: "Advising worksheet",
        dueAt: "2026-10-09T17:00:00.000Z",
        category: "First-Year Advising F26",
      },
      {
        uid: "90007@moodle.davidson.edu",
        title: "Final project proposal",
        dueAt: "2026-10-21T03:59:00.000Z",
        category: "CSC221-A-F26",
      },
      // Past ones after the upcoming, the most recent first.
      {
        uid: "90005@moodle.davidson.edu",
        title: "Problem set 2",
        dueAt: "2026-09-26T03:59:00.000Z",
        category: "CSC221-A-F26",
      },
      {
        uid: "90009@moodle.davidson.edu",
        title: "Reading quiz 1",
        dueAt: "2026-09-20T03:59:00.000Z",
        category: "CSC221-A-F26",
      },
    ]);
    // "Quiz 2 opens" is not a deadline, the cancelled retake is gone, and no description or location is kept.
    expect(JSON.stringify(events)).not.toMatch(/opens|retake|Submit|Chambers/);
  });

  it.each([
    ["Moodle's answer to a bad token", "invalid-auth.txt", "auth"],
    ["a sign-in page", "login.html", "not_calendar"],
    ["another calendar program's export", "not-moodle.ics", "not_moodle"],
    ["a VEVENT that never ends", "malformed.ics", "malformed"],
  ])("refuses %s", (_case, file, problem) => {
    expect(problemOf(fixture(file))).toBe(problem);
  });

  it("refuses empty and garbage text, and a Moodle calendar without a PRODID", () => {
    expect(problemOf("")).toBe("not_calendar");
    expect(problemOf("Invalid user")).toBe("auth");
    expect(problemOf("BEGIN:VCALENDAR\r\nBEGIN:VCALENDAR\r\n")).toBe("malformed");
    expect(problemOf("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n")).toBe("not_moodle");
  });

  it("skips events without a UID, a title or a start, and counts them", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024100700//EN",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "SUMMARY:No uid is due",
      "DTSTART:20261002T035900Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:1@moodle.davidson.edu",
      "DTSTART:20261002T035900Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:2@moodle.davidson.edu",
      "SUMMARY:No start is due",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:3@moodle.davidson.edu",
      "SUMMARY:<b>Essay</b> 1 is due",
      "DTSTART:20261002T035900Z",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const result = parseMoodleCalendar(text, NOW);
    expect(result.skipped).toBe(3);
    expect(result.events.map((event) => event.title)).toEqual(["Essay 1"]);
  });

  it(`skips a due time more than ${MOODLE_DUE_WINDOW_DAYS} days from now, or one no ISO date can hold, and counts it`, () => {
    const event = (uid: string, start: string) =>
      [
        "BEGIN:VEVENT",
        `UID:${uid}@moodle.davidson.edu`,
        `SUMMARY:Task ${uid} is due`,
        start,
        "END:VEVENT",
      ].join("\r\n");
    const text = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024100700//EN",
      "VERSION:2.0",
      // ical.js rolls this over into the year 10007: a valid Date, but not one an ISO date-time can hold.
      event("huge", "DTSTART:99999999T999999"),
      event("first", "DTSTART:00010101T000000Z"),
      event("old", "DTSTART:19010101T120000Z"),
      event("far", "DTSTART:29991231T000000Z"),
      event("day", "DTSTART;VALUE=DATE:30000101"),
      // Inside the window, both ends.
      event("year-ago", "DTSTART:20251001T120000Z"),
      event("next-fall", "DTSTART:20270901T120000Z"),
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const result = parseMoodleCalendar(text, NOW);
    expect(result.skipped).toBe(5);
    expect(result.events.map((e) => e.title)).toEqual(["Task next-fall", "Task year-ago"]);
  });

  it(`keeps at most ${MOODLE_MAX_EVENTS} events from a huge feed, the soonest, and counts the rest`, () => {
    const events = Array.from({ length: 1_200 }, (_, i) =>
      [
        "BEGIN:VEVENT",
        `UID:${i}@moodle.davidson.edu`,
        `SUMMARY:Task ${i} is due`,
        // One an hour from now on, in reverse order in the file.
        `DTSTART:${new Date(NOW.getTime() + (1_200 - i) * 3_600_000).toISOString().replace(/[-:]|\.\d{3}/g, "")}`,
        "END:VEVENT",
      ].join("\r\n"),
    );
    const text = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024100700//EN",
      "VERSION:2.0",
      ...events,
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const result = parseMoodleCalendar(text, NOW);
    expect(result.events).toHaveLength(MOODLE_MAX_EVENTS);
    expect(result.capped).toBe(700);
    expect(result.events[0]?.title).toBe("Task 1199");
  });
});
