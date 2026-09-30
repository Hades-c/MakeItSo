import { describe, expect, it } from "vitest";
import { CalendarEventSchema } from "@/lib/types/content";
import {
  ACADEMIC_CALENDAR,
  CALENDAR_VERIFIED_AT,
  calendarBetween,
  calendarDeadlinesBetween,
  calendarEventSource,
  calendarForTerm,
  eventEndDay,
  getCalendarEvent,
  isStudentFacing,
  upcomingCalendar,
} from "@/server/content/academic-calendar";
import { addDays, davidsonDay } from "@/server/content/define";

const REGISTRAR_2026_27 =
  "https://www.davidson.edu/offices-and-services/registrar/academic-calendars/2026-2027";

function event(id: string) {
  const found = getCalendarEvent(id);
  if (!found) throw new Error(`missing calendar row ${id}`);
  return found;
}

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe("academic calendar data", () => {
  it("holds the 89 verified rows, each valid, sourced and unique", () => {
    expect(ACADEMIC_CALENDAR).toHaveLength(89);
    expect(new Set(ids(ACADEMIC_CALENDAR)).size).toBe(89);
    for (const row of ACADEMIC_CALENDAR) {
      expect(CalendarEventSchema.parse(row)).toEqual(row);
      expect(row.sources.length).toBeGreaterThan(0);
      if (row.end !== null) expect(row.end >= row.start).toBe(true);
      expect(["202601", "202602", "202603"]).toContain(row.termCode);
    }
    expect(CALENDAR_VERIFIED_AT).toBe("2026-09-30");
  });

  it("matches the Registrar's registration dates for Spring 2027", () => {
    expect(event("f26-webtree-spring27")).toMatchObject({
      start: "2026-10-12",
      end: "2026-11-03",
      time: "07:00",
      termCode: "202601",
      category: "registration",
      sources: [REGISTRAR_2026_27],
    });
    expect(event("f26-webtree-closes")).toMatchObject({ start: "2026-11-03", time: "17:00" });
    expect(event("f26-schedules-available")).toMatchObject({ start: "2026-11-06", time: "17:00" });
    expect(event("f26-adddrop-november")).toMatchObject({
      start: "2026-11-09",
      end: "2026-11-13",
      time: "07:00",
    });
    expect(event("f26-adddrop-ends")).toMatchObject({ start: "2026-11-13", time: "17:00" });
    expect(event("f26-adviser-conferences")).toMatchObject({
      start: "2026-10-12",
      end: "2026-11-03",
    });
  });

  it("matches the term windows and other anchor dates", () => {
    expect(event("f26-classes-begin")).toMatchObject({ start: "2026-08-24", time: "08:05" });
    expect(event("f26-final-day").start).toBe("2026-12-15");
    expect(event("s27-classes-begin")).toMatchObject({ start: "2027-01-19", time: "08:15" });
    expect(event("s27-final-day-nonseniors").start).toBe("2027-05-12");
    expect(event("su27-term")).toMatchObject({
      start: "2027-05-19",
      end: "2027-08-10",
      termCode: "202603",
    });
    expect(event("f26-fall-break")).toMatchObject({ start: "2026-09-21", end: "2026-09-22" });
    expect(event("s27-spring-break")).toMatchObject({ start: "2027-03-08", end: "2027-03-12" });
    expect(event("s27-commencement")).toMatchObject({ start: "2027-05-16", time: "10:00" });
  });

  it("tags rows between terms with the term they concern", () => {
    expect(event("f26-halls-close").termCode).toBe("202601");
    expect(event("f26-grades-due").termCode).toBe("202601");
    expect(event("s27-leave-spring-late").termCode).toBe("202602");
    expect(event("s27-halls-open").termCode).toBe("202602");
    expect(event("s27-moveout-nonseniors").termCode).toBe("202602");
    expect(event("s27-spring-incompletes").termCode).toBe("202602");
    expect(event("su27-contract-grades").termCode).toBe("202603");
    expect(ids(calendarForTerm("202603"))).toEqual([
      "su27-term",
      "su27-memorial-day",
      "su27-leave-fall-late",
      "su27-juneteenth",
      "su27-independence-day",
      "su27-contract-grades",
    ]);
    expect(calendarForTerm("202701")).toEqual([]);
  });

  it("keeps faculty- and staff-only rows out of student views", () => {
    for (const id of [
      "f26-textbooks",
      "f26-grades-due",
      "f26-chairs-review-spring",
      "f26-thanksgiving-holiday",
      "s27-grades-seniors",
    ]) {
      expect([id, isStudentFacing(event(id))]).toEqual([id, false]);
    }
    for (const id of [
      "f26-webtree-spring27",
      "f26-chairs-review-degreeworks", // "Department chairs; senior majors"
      "su27-contract-grades", // "Faculty; students in Summer 2027 contract courses"
      "f26-minor-declaration",
    ]) {
      expect([id, isStudentFacing(event(id))]).toEqual([id, true]);
    }
  });

  it("tags each row with the office that published it", () => {
    expect(calendarEventSource(event("f26-webtree-spring27"))).toBe("registrar");
    expect(calendarEventSource(event("f26-leave-spring-notice"))).toBe("registrar"); // personal leave page
    expect(calendarEventSource(event("f26-minor-declaration"))).toBe("registrar");
    expect(calendarEventSource(event("su27-term"))).toBe("registrar"); // Banner terms
    expect(calendarEventSource(event("f26-thanksgiving-holiday"))).toBe("davidson-offices"); // HR
    expect(calendarEventSource(event("f26-halls-close"))).toBe("davidson-offices"); // Residence Life
    expect(calendarEventSource(event("s27-cis-application"))).toBe("davidson-offices");
    expect(calendarEventSource(event("s27-easter"))).toBe("davidson-offices");
  });

  it("is frozen", () => {
    const row = event("f26-fall-break");
    expect(() => {
      (row as { title: string }).title = "changed";
    }).toThrow(TypeError);
    expect(Object.isFrozen(ACADEMIC_CALENDAR)).toBe(true);
    expect(getCalendarEvent("no-such-row")).toBeUndefined();
  });
});

describe("calendar queries", () => {
  const now = new Date("2026-09-30T12:00:00-04:00");

  it("lists the next days, including windows already under way", () => {
    const next = ids(upcomingCalendar(now, 14));
    expect(next).toEqual([
      "f26-chairs-review-degreeworks",
      "f26-minor-declaration",
      "f26-adviser-conferences",
      "f26-webtree-spring27",
    ]);
    expect(ids(upcomingCalendar(now, 14, { audience: "all" }))).toContain("f26-textbooks");
    expect(ids(upcomingCalendar(now, 1))).toEqual(["f26-chairs-review-degreeworks"]);
    expect(eventEndDay(event("f26-minor-declaration"))).toBe("2026-10-01");
  });

  it("reads a moment as its Davidson (America/New_York) day", () => {
    // 23:30 ET on Sep 30 is already Oct 1 in UTC.
    expect(ids(upcomingCalendar(new Date("2026-10-01T03:30:00Z"), 1))).not.toContain(
      "f26-minor-declaration",
    );
    expect(ids(upcomingCalendar(new Date("2026-10-01T04:30:00Z"), 1))).toContain(
      "f26-minor-declaration",
    );
  });

  it("handles the DST changes (2026-11-01 and 2027-03-14)", () => {
    // Nov 1 23:30 EST is 04:30 UTC on Nov 2.
    expect(ids(upcomingCalendar(new Date("2026-11-02T04:30:00Z"), 1))).toEqual([
      "f26-adviser-conferences",
      "f26-webtree-spring27",
      "f26-jan-grad-app",
      "f26-leave-spring-notice",
    ]);
    // Mar 14 23:30 EDT is 03:30 UTC on Mar 15; 00:30 EDT is 04:30 UTC.
    expect(ids(upcomingCalendar(new Date("2027-03-15T03:30:00Z"), 1))).not.toContain(
      "s27-webtree-fall27",
    );
    expect(ids(upcomingCalendar(new Date("2027-03-15T04:30:00Z"), 1))).toContain(
      "s27-webtree-fall27",
    );
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDays("2027-03-13", 2)).toBe("2027-03-15");
  });

  it("filters by category and rejects bad input", () => {
    expect(
      ids(calendarBetween("2026-11-20", "2026-11-30", { categories: ["break", "classes"] })),
    ).toEqual(["f26-thanksgiving-break", "f26-classes-resume"]);
    expect(calendarBetween("2026-12-01", "2026-11-01")).toEqual([]);
    expect(() => upcomingCalendar(now, 0)).toThrow(RangeError);
    expect(() => upcomingCalendar(now, 1.5)).toThrow(RangeError);
    expect(() => davidsonDay("2026-02-30")).toThrow(RangeError);
    expect(() => davidsonDay(new Date("nope"))).toThrow(RangeError);
    expect(davidsonDay("2026-10-12")).toBe("2026-10-12");
  });

  it("gives Due soon the student deadlines and registration windows", () => {
    const due = calendarDeadlinesBetween(now, "2026-11-15");
    expect(due.map((d) => d.id)).toEqual([
      "calendar:f26-minor-declaration",
      "calendar:f26-webtree-spring27",
      "calendar:f26-jan-grad-app",
      "calendar:f26-leave-spring-notice",
      "calendar:f26-webtree-closes",
      "calendar:f26-schedules-available",
      "calendar:f26-adddrop-november",
      "calendar:f26-adddrop-ends",
      "calendar:f26-transfer-preauth",
    ]);
    expect(due[1]).toEqual({
      id: "calendar:f26-webtree-spring27",
      kind: "calendar",
      title: "WebTree Open: Submit Spring 2027 Course Preferences",
      label: null,
      date: "2026-10-12",
      endDate: "2026-11-03",
      time: "07:00",
      source: "registrar",
      url: REGISTRAR_2026_27,
      audience: "All students",
      termCode: "202601",
      officeSlug: null,
      verifiedAt: "2026-09-30",
    });
    const januaryAll = calendarDeadlinesBetween("2027-01-05", "2027-01-05", { audience: "all" });
    expect(januaryAll.map((d) => d.id)).toEqual([
      "calendar:s27-adddrop-opens",
      "calendar:f26-grades-due",
    ]);
    expect(calendarDeadlinesBetween("2027-01-05", "2027-01-05").map((d) => d.id)).toEqual([
      "calendar:s27-adddrop-opens",
    ]);
  });
});
