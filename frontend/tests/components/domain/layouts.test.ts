import { describe, expect, it } from "vitest";
import {
  academicYearLabel,
  groupByYear,
  layoutTerm,
  planTotals,
  share,
  slotSpan,
  termShortLabel,
  type PlanMapTerm,
} from "@/components/domain/plan-layout";
import { windowFromHours } from "@/components/domain/time-geometry";
import { itemInterval, layoutDay, type TimelineItem } from "@/components/domain/timeline-layout";
import { describeBlock, layoutWeek, type WeekGridBlock } from "@/components/domain/week-layout";

const NINE_TO_FOUR = windowFromHours(9, 16);

/** The Lakeside mockup's Fall 2026 week (Davidson public schedule, 202601), with HIS 357 A as a candidate. */
const FALL_2026: WeekGridBlock[] = [
  ...(["M", "W", "F"] as const).map((day) => ({
    id: `csc-${day}`,
    code: "CSC 221 A",
    day,
    start: "10:30",
    end: "11:20",
  })),
  ...(["M", "W", "F"] as const).map((day) => ({
    id: `eco-${day}`,
    code: "ECO 232 A",
    day,
    start: "11:30",
    end: "12:20",
  })),
  ...(["T", "R"] as const).map((day) => ({
    id: `eng-${day}`,
    code: "ENG 260 A",
    day,
    start: "09:40",
    end: "10:55",
  })),
  ...(["M", "W"] as const).map((day) => ({
    id: `env-${day}`,
    code: "ENV 237 A",
    day,
    start: "14:30",
    end: "15:45",
  })),
  ...(["T", "R"] as const).map((day) => ({
    id: `his-${day}`,
    code: "HIS 357 A",
    day,
    start: "12:15",
    end: "13:30",
    tentative: true,
  })),
];

describe("layoutWeek", () => {
  it("places the mockup week on Monday–Friday with no conflicts", () => {
    const layout = layoutWeek(FALL_2026, NINE_TO_FOUR);
    expect(layout.days).toEqual(["M", "T", "W", "R", "F"]);
    expect(layout.byDay.M.map((p) => p.block.code)).toEqual([
      "CSC 221 A",
      "ECO 232 A",
      "ENV 237 A",
    ]);
    expect(layout.byDay.T.map((p) => p.block.code)).toEqual(["ENG 260 A", "HIS 357 A"]);
    expect(layout.byDay.F.map((p) => p.block.code)).toEqual(["CSC 221 A", "ECO 232 A"]);
    expect(layout.conflicts).toEqual([]);
    expect(layout.tba).toEqual([]);
    expect(layout.outside).toEqual([]);
    const csc = layout.byDay.M[0]!;
    expect(csc.top).toBeCloseTo(90 / 420, 10);
    expect(csc.height).toBeCloseTo(50 / 420, 10);
    expect([csc.lane, csc.lanes]).toEqual([0, 1]);
  });

  it("puts overlapping blocks in lanes and describes the conflict in words", () => {
    const layout = layoutWeek(
      [
        ...FALL_2026,
        { id: "che-M", code: "CHE 115 A", day: "M", start: "11:00", end: "12:15", conflict: true },
        { id: "che-W", code: "CHE 115 A", day: "W", start: "11:00", end: "12:15", conflict: true },
      ],
      NINE_TO_FOUR,
    );
    const monday = layout.byDay.M.map((p) => [p.block.code, p.lane, p.lanes]);
    expect(monday).toEqual([
      ["CSC 221 A", 0, 2],
      ["CHE 115 A", 1, 2],
      ["ECO 232 A", 0, 2],
      ["ENV 237 A", 0, 1],
    ]);
    expect(layout.conflicts).toEqual([
      "CHE 115 A overlaps CSC 221 A on Mon, Wed (11:00a–11:20a).",
      "ECO 232 A overlaps CHE 115 A on Mon, Wed (11:30a–12:15p).",
    ]);
  });

  it("only reports overlaps the plan service flagged", () => {
    // Cross-listed siblings share a room and time but are one class: not flagged, not reported.
    const layout = layoutWeek(
      [
        { id: "a", code: "ENV 237 A", day: "M", start: "14:30", end: "15:45" },
        { id: "b", code: "DAT 237 A", day: "M", start: "14:30", end: "15:45" },
      ],
      NINE_TO_FOUR,
    );
    expect(layout.conflicts).toEqual([]);
    expect(layout.byDay.M.map((p) => p.lanes)).toEqual([2, 2]);
  });

  it("mentions a flagged block whose partner is not on the grid", () => {
    const layout = layoutWeek(
      [{ id: "x", code: "PHY 120 A", day: "T", start: "13:40", end: "14:55", conflict: true }],
      NINE_TO_FOUR,
    );
    expect(layout.conflicts).toEqual(["PHY 120 A has a time conflict on Tue."]);
  });

  it("lists TBA meetings and meetings outside the window instead of placing them", () => {
    const layout = layoutWeek(
      [
        { id: "tba", code: "MUS 010 A", title: "Chamber Singers", tba: true },
        { id: "noday", code: "BIO 111 L", start: "13:40", end: "16:30" },
        { id: "notime", code: "PHY 120 L", day: "W" },
        { id: "eve", code: "THE 101 A", day: "R", start: "19:00", end: "21:30" },
        { id: "early", code: "HIS 142 A", day: "M", start: "08:05", end: "08:55" },
        { id: "edge", code: "MAT 110 A", day: "F", start: "08:30", end: "09:45" },
      ],
      NINE_TO_FOUR,
    );
    expect(layout.tba.map((b) => b.block.id)).toEqual(["tba", "noday", "notime"]);
    expect(layout.outside.map((b) => b.block.id)).toEqual(["early", "eve"]);
    const edge = layout.byDay.F[0]!;
    expect(edge.clippedStart).toBe(true);
    expect(edge.top).toBe(0);
    expect(edge.height).toBeCloseTo(45 / 420, 10);
  });

  it("adds weekend columns when a block needs them", () => {
    expect(layoutWeek(FALL_2026, NINE_TO_FOUR, ["M", "T", "W", "R", "F", "S", "U"]).days).toEqual([
      "M",
      "T",
      "W",
      "R",
      "F",
      "S",
      "U",
    ]);
    expect(
      layoutWeek(
        [{ id: "s", code: "ENV 220 A", day: "S", start: "09:00", end: "12:00" }],
        NINE_TO_FOUR,
      ).days,
    ).toEqual(["M", "T", "W", "R", "F", "S"]);
  });

  it("describes a block for screen readers", () => {
    expect(
      describeBlock(
        {
          id: "x",
          code: "HIS 357 A",
          title: "The Civil Rights Movement",
          room: "Chambers 1027",
          tentative: true,
        },
        "T",
        { start: 735, end: 810 },
      ),
    ).toBe(
      "HIS 357 A, The Civil Rights Movement, Tuesday 12:15p to 1:30p, Chambers 1027, tentative",
    );
    expect(describeBlock({ id: "y", code: "MUS 010 A", tba: true })).toBe("MUS 010 A, time TBA");
  });
});

describe("layoutDay", () => {
  const WEDNESDAY: TimelineItem[] = [
    {
      id: "csc",
      kind: "class",
      code: "CSC 221 A",
      title: "Data Structures",
      start: "10:30",
      end: "11:20",
      location: "Watson 132",
      source: "course-schedule",
    },
    {
      id: "eco",
      kind: "class",
      code: "ECO 232 A",
      title: "Economics of Migration",
      start: "11:30",
      end: "12:20",
      location: "Watson 243",
      source: "course-schedule",
    },
    {
      id: "env",
      kind: "class",
      code: "ENV 237 A",
      title: "Intro to Interdisciplinary GIS",
      start: "14:30",
      end: "15:45",
      location: "Watson 247",
      source: "course-schedule",
    },
  ];

  it("lays out the mockup Wednesday at 9:12 with the lunch gap and the next class", () => {
    const layout = layoutDay(WEDNESDAY, NINE_TO_FOUR, { nowMinute: 552, showFreeGaps: true });
    expect(layout.blocks.map((b) => b.item.id)).toEqual(["csc", "eco", "env"]);
    expect(layout.gaps.map((g) => g.interval)).toEqual([{ start: 740, end: 870 }]);
    expect(layout.now).toBeCloseTo(12 / 420, 10);
    expect(layout.nextId).toBe("csc");
    expect(layout.currentIds).toEqual([]);
    expect(layout.earlier).toEqual([]);
    expect(layout.later).toEqual([]);
  });

  it("knows what is happening now and hides gaps unless asked", () => {
    const layout = layoutDay(WEDNESDAY, NINE_TO_FOUR, { nowMinute: 660 });
    expect(layout.currentIds).toEqual(["csc"]);
    expect(layout.nextId).toBe("eco");
    expect(layout.gaps).toEqual([]);
  });

  it("marks deadlines as points, lists evening items and unreadable times", () => {
    const layout = layoutDay(
      [
        ...WEDNESDAY,
        {
          id: "ps",
          kind: "deadline",
          code: "CSC 221",
          title: "Problem set",
          start: "11:59",
          source: "registrar",
        },
        {
          id: "late",
          kind: "deadline",
          title: "Housing form",
          start: "23:59",
          end: "23:59",
          source: "registrar",
        },
        {
          id: "club",
          kind: "event",
          title: "Club open house",
          start: "19:00",
          end: "20:30",
          source: "wildcatsync",
        },
        {
          id: "bad",
          kind: "event",
          title: "Mystery",
          start: "soon",
          end: "later",
          source: "wildcatsync",
        },
      ],
      NINE_TO_FOUR,
      { nowMinute: 1170 },
    );
    expect(layout.deadlines.map((d) => [d.item.id, d.minute])).toEqual([["ps", 719]]);
    expect(layout.later.map((l) => l.item.id)).toEqual(["club", "late"]);
    expect(layout.unscheduled.map((i) => i.id)).toEqual(["bad"]);
    expect(layout.now).toBeNull();
  });

  it("overlapping items share the width", () => {
    const layout = layoutDay(
      [
        WEDNESDAY[0]!,
        {
          id: "talk",
          kind: "event",
          title: "Faculty talk",
          start: "11:00",
          end: "12:00",
          source: "hurt-hub",
        },
      ],
      NINE_TO_FOUR,
    );
    expect(layout.blocks.map((b) => [b.item.id, b.lane, b.lanes])).toEqual([
      ["csc", 0, 2],
      ["talk", 1, 2],
    ]);
  });

  it("reads item intervals", () => {
    expect(itemInterval(WEDNESDAY[0]!)).toEqual({ start: 630, end: 680 });
    expect(
      itemInterval({
        id: "d",
        kind: "deadline",
        title: "x",
        start: "17:00",
        end: "18:00",
        source: "registrar",
      }),
    ).toEqual({ start: 1020, end: 1020 });
    expect(
      itemInterval({
        id: "e",
        kind: "event",
        title: "x",
        start: "18:00",
        end: "17:00",
        source: "registrar",
      }),
    ).toBeNull();
  });
});

describe("plan layout", () => {
  it.each([
    ["202501", "fall", "F25", "2025–26"],
    ["202502", "spring", "S26", "2025–26"],
    ["202503", "summer", "Su26", "2025–26"],
    ["202801", "fall", "F28", "2028–29"],
    ["209999", "unknown", "209999", "2099–00"],
  ])("%s → %s %s (%s)", (code, season, short, year) => {
    expect(termShortLabel(code)).toEqual({ season, short });
    expect(academicYearLabel(code)).toBe(year);
  });

  it.each([
    [1, 1],
    [2, 2],
    [0, 0],
    [0.5, 1],
    [-1, 0],
    [Number.NaN, 0],
  ])("a %d-credit course fills %d slots", (credits, span) => {
    expect(slotSpan(credits)).toBe(span);
  });

  it("pads a term to four slots, spans 2-credit courses and lists 0-credit ones", () => {
    const term: PlanMapTerm = {
      termCode: "202501",
      label: "Fall 2025",
      slots: [
        { status: "done", code: "HUM 103", credits: 2 },
        { status: "done", code: "CSC 121", credits: 1 },
        { status: "done", code: "MUS 010", credits: 0 },
      ],
    };
    const layout = layoutTerm(term);
    expect(layout.cells.map((c) => [c.code ?? "open", c.span])).toEqual([
      ["HUM 103", 2],
      ["CSC 121", 1],
      ["open", 1],
    ]);
    expect(layout.unslotted.map((s) => s.code)).toEqual(["MUS 010"]);
    expect(layout.openSlots).toBe(1);
  });

  it("lets an overloaded term grow and keeps explicit open slots", () => {
    const five = layoutTerm({
      termCode: "202601",
      label: "Fall 2026",
      slots: ["A", "B", "C", "D", "E"].map((x) => ({
        status: "in-progress" as const,
        code: `CSC 10${x}`,
        credits: 1,
      })),
    });
    expect(five.cells).toHaveLength(5);
    const explicit = layoutTerm({
      termCode: "202602",
      label: "Spring 2027",
      slots: [
        { status: "open", credits: 1 },
        { status: "planned", code: "CSC 250", credits: 1 },
      ],
    });
    expect(explicit.cells.map((c) => c.status)).toEqual(["open", "planned", "open", "open"]);
  });

  it("totals credits by status and caps the bar at 100%", () => {
    const totals = planTotals(
      [
        {
          termCode: "202501",
          label: "Fall 2025",
          slots: [
            { status: "done", code: "HUM 103", credits: 2 },
            { status: "done", code: "MUS 010", credits: 0 },
          ],
        },
        {
          termCode: "202601",
          label: "Fall 2026",
          slots: [{ status: "in-progress", code: "CSC 221", credits: 1 }],
        },
        {
          termCode: "202701",
          label: "Fall 2027",
          slots: [
            { status: "planned", code: "HIS 357", credits: 1 },
            { status: "open", credits: 1 },
          ],
        },
      ],
      32,
    );
    expect(totals).toEqual({
      done: 2,
      inProgress: 1,
      planned: 1,
      required: 32,
      earnedOrEarning: 3,
    });
    expect(share(8, 32)).toBe(0.25);
    expect(share(40, 32)).toBe(1);
    expect(share(1, 0)).toBe(0);
  });

  it("groups terms into academic years, summers included", () => {
    const rows = groupByYear(
      ["202501", "202502", "202503", "202601", "202602"].map((termCode) =>
        layoutTerm({ termCode, label: termCode, slots: [] }),
      ),
    );
    expect(
      rows.map((r) => [r.label, r.fall?.short, r.spring?.short, r.summer?.short ?? null]),
    ).toEqual([
      ["2025–26", "F25", "S26", "Su26"],
      ["2026–27", "F26", "S27", null],
    ]);
  });
});
