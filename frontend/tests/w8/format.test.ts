import { describe, expect, it } from "vitest";
import {
  availabilityText,
  compactDays,
  creditsLabel,
  eligibleYearsText,
  instructorName,
  joinTermLabels,
  longDays,
  meetingRoom,
  meetingText,
  openSeatsLabel,
  orderedMeetings,
  primarySections,
  restrictionFlags,
  sectionLabel,
  sectionTimes,
  sectionsLabel,
  usuallyOfferedText,
} from "@/app/(hub)/courses/_lib/format";
import type { Meeting } from "@/lib/types/catalog";
import { section, withSection } from "./helpers";

/** PLAN §5 "Sections" and "Availability" display rules, on real fixture sections where they exist. */

const meeting = (patch: Partial<Meeting>): Meeting => ({
  days: ["M", "W", "F"],
  start: "10:30",
  end: "11:20",
  kind: "class",
  tba: false,
  ...patch,
});

describe("meetings", () => {
  it("prints days in calendar order, compact and long", () => {
    expect(compactDays(["F", "M", "W"])).toBe("MWF");
    expect(longDays(["R", "T"])).toBe("Tue · Thu");
  });

  it("formats a class meeting in ET wall-clock time", () => {
    expect(meetingText(meeting({}))).toBe("MWF 10:30a–11:20a");
    expect(meetingText(meeting({ days: ["T", "R"], start: "12:15", end: "13:30" }), "long")).toBe(
      "Tue · Thu 12:15p–1:30p",
    );
  });

  it("says Time TBA for no days or no start, never a guessed time", () => {
    expect(meetingText(meeting({ days: [], tba: true }))).toBe("Time TBA");
    expect(meetingText(meeting({ start: null, end: null, tba: true }))).toBe("Time TBA");
    expect(sectionTimes({ meetings: [] })).toEqual(["Time TBA"]);
  });

  it("labels second meeting times and labs, and lists the class meeting first", () => {
    const lab = meeting({ kind: "lab", days: ["T"], start: "13:30", end: "16:20" });
    const second = meeting({ kind: "second", days: ["R"], start: "08:15", end: "09:05" });
    const lecture = meeting({});
    expect(orderedMeetings([lab, second, lecture]).map((m) => m.kind)).toEqual([
      "class",
      "second",
      "lab",
    ]);
    expect(sectionTimes({ meetings: [lab, lecture] })).toEqual([
      "MWF 10:30a–11:20a",
      "Lab · T 1:30p–4:20p",
    ]);
    expect(meetingText(second)).toBe("Second meeting · R 8:15a–9:05a");
  });

  it("prints the building and room together", () => {
    expect(meetingRoom({ building: "Chambers", room: "1027" })).toBe("Chambers 1027");
    expect(meetingRoom({})).toBeNull();
  });

  it("formats a real fixture section (CSC 221 A, Spring 2027)", () => {
    const csc = section("202602", "CSC 221", "A");
    expect(sectionTimes(csc)).toEqual(["MWF 10:30a–11:20a"]);
    expect(sectionLabel(csc)).toBe("CSC 221 A");
  });
});

describe("instructors, credits, seats", () => {
  it("shows the Staff placeholder as Staff (TBA)", () => {
    expect(instructorName({ first: "", last: "Staff", isStaff: true })).toBe("Staff (TBA)");
    expect(instructorName({ first: "Dan", last: "Aldridge", isStaff: false })).toBe("Dan Aldridge");
    const rus = section("202602", "RUS 496", "A");
    expect(rus.instructors.map(instructorName)).toContain("Staff (TBA)");
  });

  it("counts Davidson course credits (1 per course; 0 and ranges exist)", () => {
    expect(creditsLabel([1])).toBe("1 course credit");
    expect(creditsLabel([0])).toBe("0 course credits");
    expect(creditsLabel([1, 0])).toBe("0–1 course credits");
    expect(creditsLabel([])).toBe("Credits not listed");
  });

  it("never shows negative open seats", () => {
    expect(openSeatsLabel(9)).toBe("9 seats open");
    expect(openSeatsLabel(1)).toBe("1 seat open");
    expect(openSeatsLabel(0)).toBe("No open seats");
    expect(sectionsLabel(1)).toBe("1 section");
    expect(sectionsLabel(3)).toBe("3 sections");
  });
});

describe("restrictions", () => {
  it("names the class years a code allows", () => {
    expect(eligibleYearsText([1, 2])).toBe("First-years and sophomores only");
    expect(eligibleYearsText([4, 2, 3])).toBe("Sophomores, juniors and seniors only");
    expect(eligibleYearsText([1])).toBe("First-years only");
  });

  it("flags class years (+ until the first day), PRM and W from real notes", () => {
    expect(restrictionFlags(section("202602", "ART 101", "A"))).toEqual([
      "First-years and sophomores only until the first day of class",
    ]);
    expect(restrictionFlags(section("202602", "ANT 285", "A"))).toEqual([
      "First-years and sophomores only",
    ]);
    expect(restrictionFlags(section("202602", "ART 496", "A"))).toContain(
      "Instructor permission required",
    );
    expect(restrictionFlags(section("202602", "WRI 101", "A"))).toContain(
      "Closed if you have met the writing requirement",
    );
    expect(restrictionFlags(section("202602", "CSC 221", "A"))).toEqual([]);
  });

  it("keeps labs out of the primary sections unless there is nothing else", () => {
    const base = section("202602", "CSC 221", "A");
    const lab = withSection(base, { section: "L1", crn: "29999" });
    expect(primarySections([base, lab]).map((s) => s.section)).toEqual(["A"]);
    expect(primarySections([lab]).map((s) => s.section)).toEqual(["L1"]);
  });
});

describe("availability", () => {
  it("never says a bare Offered for an unpublished term", () => {
    expect(availabilityText({ termCode: "202602", status: "offered", sectionCount: 2 })).toBe(
      "Offered · 2 sections",
    );
    expect(availabilityText({ termCode: "202602", status: "not-offered" })).toBe("Not offered");
    expect(availabilityText({ termCode: "202701", status: "not-yet-published" })).toBe(
      "Not yet published",
    );
  });

  it("adds Usually offered only for an unpublished term with a basis", () => {
    expect(
      usuallyOfferedText({
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202401", "202501"] },
      }),
    ).toBe("Usually offered in Fall (based on Fall 2024 and Fall 2025)");
    expect(usuallyOfferedText({ termCode: "202701", status: "not-yet-published" })).toBeNull();
    expect(
      usuallyOfferedText({
        termCode: "202602",
        status: "offered",
        usually: { season: "Spring", basedOn: ["202502"] },
      }),
    ).toBeNull();
    expect(joinTermLabels(["202401", "202501", "202601"])).toBe(
      "Fall 2024, Fall 2025 and Fall 2026",
    );
  });
});
