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
import { overlaps, windowFromHours, type Interval } from "@/components/domain/time-geometry";
import {
  DEADLINE_LABEL_MINUTES,
  gapTextPlacement,
  hourLabelsClearOfNow,
  itemInterval,
  layoutDay,
  placeDeadlineLabels,
  type TimelineItem,
} from "@/components/domain/timeline-layout";
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
    expect(layout.outside[1]!.interval).toMatchObject({ start: 1140, end: 1290 });
    const edge = layout.byDay.F[0]!;
    expect(edge.clippedStart).toBe(true);
    expect(edge.top).toBe(0);
    expect(edge.height).toBeCloseTo(45 / 420, 10);
  });

  it("draws a meeting that runs past midnight to 24:00 instead of calling it TBA", () => {
    const window = windowFromHours(18, 24);
    const layout = layoutWeek(
      [
        {
          id: "late",
          code: "AST 101 L",
          title: "Observing lab",
          day: "W",
          start: "22:00",
          end: "00:30",
        },
      ],
      window,
    );
    expect(layout.tba).toEqual([]);
    const late = layout.byDay.W[0]!;
    expect(late.interval).toEqual({ start: 1320, end: 1440, shownEnd: 30, pastMidnight: true });
    expect(late.clippedEnd).toBe(true);
    expect(late.top).toBeCloseTo(4 / 6, 10);
    expect(late.height).toBeCloseTo(2 / 6, 10);
    expect(describeBlock(late.block, "W", late.interval)).toBe(
      "AST 101 L, Observing lab, Wednesday 10:00p to 12:30a",
    );
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

describe("layoutDay", () => {
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
    expect(itemInterval(WEDNESDAY[0]!)).toEqual({
      start: 630,
      end: 680,
      shownEnd: 680,
      pastMidnight: false,
    });
    expect(
      itemInterval({
        id: "d",
        kind: "deadline",
        title: "x",
        start: "17:00",
        end: "18:00",
        source: "registrar",
      }),
    ).toMatchObject({ start: 1020, end: 1020 });
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

  it("keeps an item that runs past midnight, clipped at the end with its real end time", () => {
    const late: TimelineItem = {
      id: "late",
      kind: "event",
      title: "Late study session",
      start: "22:00",
      end: "00:30",
      source: "my-plan",
    };
    expect(itemInterval(late)).toEqual({
      start: 1320,
      end: 1440,
      shownEnd: 30,
      pastMidnight: true,
    });
    // Outside a 9a–4p view: listed as later today, not as "time not listed".
    const day = layoutDay([late], NINE_TO_FOUR);
    expect(day.unscheduled).toEqual([]);
    expect(day.later.map((l) => l.interval.shownEnd)).toEqual([30]);
    // In an evening view: drawn to the bottom edge, "until 12:30a".
    const evening = layoutDay([late], windowFromHours(18, 24));
    expect(evening.blocks[0]).toMatchObject({ clippedEnd: true, clippedStart: false });
    expect(evening.blocks[0]!.top + evening.blocks[0]!.height).toBeCloseTo(1, 10);
  });

  it("groups overlapping blocks (touching ones do not overlap)", () => {
    const layout = layoutDay(
      [
        ...WEDNESDAY,
        {
          id: "talk",
          kind: "event",
          title: "Talk",
          start: "12:00",
          end: "13:00",
          source: "hurt-hub",
        },
        {
          id: "drop",
          kind: "event",
          title: "Drop-in",
          start: "12:30",
          end: "13:30",
          source: "registrar",
        },
        {
          id: "his",
          kind: "class",
          code: "HIS 357 A",
          title: "Civil Rights",
          start: "12:15",
          end: "13:30",
          source: "course-schedule",
        },
      ],
      NINE_TO_FOUR,
    );
    expect(layout.groups).toHaveLength(1);
    const group = layout.groups[0]!;
    expect(group.interval).toEqual({ start: 690, end: 810 });
    expect(group.lanes).toBe(3);
    expect(group.blocks.map((b) => b.item.id)).toEqual(["eco", "talk", "his", "drop"]);
    expect(layout.blocks.find((b) => b.item.id === "csc")!.group).toBeNull();
    expect(layout.blocks.find((b) => b.item.id === "his")!.group).toBe(0);
  });
});

describe("deadline labels", () => {
  const busy = [
    { start: 630, end: 680 }, // CSC 221 A 10:30–11:20
    { start: 690, end: 740 }, // ECO 232 A 11:30–12:20
    { start: 870, end: 945 }, // ENV 237 A 2:30–3:45
  ];

  it.each([
    // [deadline, placement]: a label needs an hour of free time on one side of its line.
    ["during a class: listed", 660, null],
    ["at a class's start, free before it: above", 630, "above"],
    ["between two classes 10 minutes apart: listed", 685, null],
    ["lunch gap, room above: above", 860, "above"],
    ["lunch gap, room below only: below", 745, "below"],
    ["window start, free below: below", 540, "below"],
    ["window end, just after the last class: listed", 960, null],
  ] as const)("%s", (_name, minute, expected) => {
    expect(placeDeadlineLabels([minute], busy, NINE_TO_FOUR)[0]!.label).toBe(expected);
  });

  it("never lets a label cover a block or another label", () => {
    const minutes = [540, 560, 600, 630, 660, 745, 800, 820, 860, 945, 960];
    const placed = placeDeadlineLabels(minutes, busy, NINE_TO_FOUR);
    const spans = placed.flatMap((p) => (p.span ? [p.span] : []));
    for (const span of spans) {
      expect(span.end - span.start).toBe(DEADLINE_LABEL_MINUTES);
      expect(busy.some((b) => overlaps(b, span))).toBe(false);
      expect(span.start).toBeGreaterThanOrEqual(NINE_TO_FOUR.start);
      expect(span.end).toBeLessThanOrEqual(NINE_TO_FOUR.end);
    }
    for (let i = 0; i < spans.length; i++)
      for (let j = i + 1; j < spans.length; j++) expect(overlaps(spans[i]!, spans[j]!)).toBe(false);
    // Two deadlines at the same minute: one above, one below.
    expect(placeDeadlineLabels([800, 800], busy, NINE_TO_FOUR).map((p) => p.label)).toEqual([
      "above",
      "below",
    ]);
  });

  it("layoutDay lists a deadline during a class and labels one in free time", () => {
    const layout = layoutDay(
      [
        ...WEDNESDAY,
        { id: "quiz", kind: "deadline", title: "Quiz", start: "11:00", source: "my-plan" },
        { id: "ps", kind: "deadline", title: "Problem set", start: "13:59", source: "my-plan" },
      ],
      NINE_TO_FOUR,
      { showFreeGaps: true },
    );
    expect(layout.deadlines.map((d) => [d.item.id, d.label])).toEqual([
      ["quiz", null],
      ["ps", "above"],
    ]);
    // The lunch gap (12:20–2:30) keeps its text clear of the label (12:59–1:59): at the top.
    expect(layout.gaps.map((g) => g.text)).toEqual(["start"]);
  });

  it.each([
    ["no label in the gap", [], "center"],
    ["label in the lower part", [{ start: 800, end: 860 }], "start"],
    ["label in the upper part", [{ start: 740, end: 800 }], "end"],
    [
      "label fills it",
      [
        { start: 745, end: 805 },
        { start: 805, end: 865 },
      ],
      "hidden",
    ],
  ] as const)("gap text: %s", (_name, labels, expected) => {
    expect(gapTextPlacement({ start: 740, end: 870 }, labels as readonly Interval[])).toBe(
      expected,
    );
  });
});

describe("now pill", () => {
  it.each([
    [552, [10, 11, 12, 13, 14, 15, 16]], // 9:12: the pill covers "9a"
    [645, [9, 10, 12, 13, 14, 15, 16]], // 10:45: "11a" is 15 minutes away
    [760, [9, 10, 11, 12, 13, 14, 15, 16]], // 12:40: 20 minutes from "1p"
    [null, [9, 10, 11, 12, 13, 14, 15, 16]],
  ])("now %s leaves hour labels %j", (now, shown) => {
    expect(hourLabelsClearOfNow([9, 10, 11, 12, 13, 14, 15, 16], now)).toEqual(shown);
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
