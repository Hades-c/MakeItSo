import { describe, expect, it } from "vitest";
import type { Meeting } from "@/lib/types/catalog";
import type { ScheduleConflict, WebTreeList } from "@/lib/types/plan";
import { describeDeadline, dayText } from "@/app/(hub)/plan/_lib/deadlines";
import {
  clockText,
  conflictLines,
  gridHours,
  meetingText,
  meetingsText,
  weekBlocks,
  type SectionTimes,
} from "@/app/(hub)/plan/_lib/week";

const mwf = (start: string, end: string, extra: Partial<Meeting> = {}): Meeting => ({
  days: ["M", "W", "F"],
  start,
  end,
  kind: "class",
  tba: false,
  ...extra,
});

const SECTIONS: Record<string, SectionTimes> = {
  "20135": {
    crn: "20135",
    courseCode: "CSC 221",
    section: "A",
    title: "Data Structures",
    meetings: [mwf("10:30", "11:20", { building: "Watson", room: "247" })],
  },
  "20136": {
    crn: "20136",
    courseCode: "CSC 221",
    section: "B",
    title: "Data Structures",
    meetings: [mwf("10:30", "11:20")],
  },
  "20478": {
    crn: "20478",
    courseCode: "SPA 201",
    section: "B",
    title: "Spanish",
    meetings: [mwf("10:30", "11:20")],
  },
  "20900": {
    crn: "20900",
    courseCode: "MUS 101",
    section: "A",
    title: "Ensemble",
    meetings: [{ days: [], start: null, end: null, kind: "class", tba: true }],
  },
};

const LIST: WebTreeList = {
  termCode: "202602",
  choices: [
    { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
    { rank: 2, crn: "20478", courseCode: "SPA 201", alternates: [] },
    { rank: 3, crn: "20900", courseCode: "MUS 101", alternates: [] },
  ],
};

const conflict = (a: string, b: string, day: "M" | "W" | "F"): ScheduleConflict => ({
  a: { crn: a, courseCode: SECTIONS[a]!.courseCode },
  b: { crn: b, courseCode: SECTIONS[b]!.courseCode },
  day,
  start: "10:30",
  end: "11:20",
});

describe("meetings as text", () => {
  it("writes days, times and room, TBA and labs", () => {
    expect(clockText("13:05")).toBe("1:05p");
    expect(clockText(null)).toBeNull();
    expect(meetingText(SECTIONS["20135"]!.meetings[0]!)).toBe("MWF 10:30a–11:20a · Watson 247");
    expect(
      meetingText({ days: ["T"], start: "13:30", end: "16:20", kind: "lab", tba: false }),
    ).toBe("Lab: T 1:30p–4:20p");
    expect(meetingsText(SECTIONS["20900"]!.meetings)).toEqual(["Time TBA"]);
    expect(meetingsText([])).toEqual(["Time TBA"]);
  });
});

describe("week grid blocks", () => {
  it("draws first choices only, one block per day, TBA listed", () => {
    const blocks = weekBlocks(LIST, SECTIONS, [conflict("20135", "20478", "M")]);
    expect(blocks.filter((b) => b.code === "CSC 221 A").map((b) => b.day)).toEqual(["M", "W", "F"]);
    expect(blocks.some((b) => b.code === "CSC 221 B")).toBe(false);
    expect(blocks.find((b) => b.code === "MUS 101 A")).toMatchObject({ tba: true });
    expect(blocks.filter((b) => b.conflict).map((b) => b.code)).toContain("SPA 201 B");
  });

  it("flags only conflicts between two first choices", () => {
    const blocks = weekBlocks(LIST, SECTIONS, [conflict("20136", "20478", "M")]);
    expect(blocks.some((b) => b.conflict)).toBe(false);
  });

  it("widens the hours to fit every block", () => {
    expect(gridHours([])).toEqual({ startHour: 8, endHour: 17 });
    expect(gridHours([{ id: "x", code: "X 1", day: "M", start: "07:45", end: "21:10" }])).toEqual({
      startHour: 7,
      endHour: 22,
    });
  });
});

describe("conflict report", () => {
  it("merges days into one sentence and names alternates", () => {
    const lines = conflictLines(LIST, SECTIONS, [
      conflict("20135", "20478", "M"),
      conflict("20135", "20478", "W"),
      conflict("20135", "20478", "F"),
      conflict("20136", "20478", "M"),
    ]);
    expect(lines).toEqual([
      {
        key: "20135|20478",
        text: "Choice 1, CSC 221 A (CRN 20135) and choice 2, SPA 201 B (CRN 20478) meet at the same time on Mon, Wed, Fri (10:30a–11:20a).",
        betweenChoices: true,
      },
      {
        key: "20136|20478",
        text: "Alternate for choice 1, CSC 221 B (CRN 20136) and choice 2, SPA 201 B (CRN 20478) meet at the same time on Mon (10:30a–11:20a).",
        betweenChoices: false,
      },
    ]);
  });
});

describe("registration deadlines", () => {
  const OPEN = {
    id: "calendar:f26-webtree-spring27",
    title: "WebTree Open",
    date: "2026-10-12",
    endDate: "2026-11-03",
    time: "07:00",
    source: "registrar" as const,
    url: "https://www.davidson.edu/x",
  };
  const CLOSES = { ...OPEN, id: "c", date: "2026-11-03", endDate: null, time: "17:00" };

  it("words dates without a zone shift", () => {
    expect(dayText("2026-10-12")).toBe("Mon, Oct 12");
    expect(dayText("bad")).toBe("bad");
  });

  it("before the window: upcoming, in N days (Davidson days)", () => {
    const view = describeDeadline(OPEN, new Date("2026-09-30T16:00:00Z"));
    expect(view).toMatchObject({
      when: "Mon, Oct 12, 7:00a – Tue, Nov 3",
      state: "upcoming",
      relative: "In 12 days",
      dateTime: "2026-10-12T07:00",
      source: "registrar",
    });
    // 11:30 pm ET on Oct 11 is already Oct 12 in UTC: still "Tomorrow" in Davidson.
    expect(describeDeadline(OPEN, new Date("2026-10-12T03:30:00Z")).relative).toBe("Tomorrow");
  });

  it("on the opening day before 7 a.m. it is today; after, the window is open", () => {
    expect(describeDeadline(OPEN, new Date("2026-10-12T10:00:00Z")).relative).toBe("Today");
    expect(describeDeadline(OPEN, new Date("2026-10-12T11:30:00Z"))).toMatchObject({
      state: "open",
      relative: "Open now",
    });
    expect(describeDeadline(OPEN, new Date("2026-11-03T23:00:00Z")).state).toBe("open");
    expect(describeDeadline(OPEN, new Date("2026-11-04T05:00:00Z")).state).toBe("past");
  });

  it("a single deadline with a time passes at that time (ET, across the DST change)", () => {
    // Nov 3 2026 is after DST ends (Nov 1): 5 p.m. ET = 22:00Z.
    expect(describeDeadline(CLOSES, new Date("2026-11-03T21:59:00Z"))).toMatchObject({
      state: "upcoming",
      relative: "Today",
      when: "Tue, Nov 3, 5:00p",
    });
    expect(describeDeadline(CLOSES, new Date("2026-11-03T22:01:00Z")).state).toBe("past");
  });
});
