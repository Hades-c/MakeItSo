import { describe, expect, it } from "vitest";
import {
  assignLanes,
  axisHours,
  clampToWindow,
  clockLabel,
  findFreeGaps,
  formatDuration,
  hourLabel,
  mergeIntervals,
  minutesToPx,
  nowLinePosition,
  overlaps,
  parseClock,
  parseInterval,
  parseSpan,
  percent,
  pxToMinutes,
  shortHourLabel,
  toFraction,
  windowForItems,
  windowFromHours,
  windowHeightPx,
  windowLabel,
  windowPosition,
  type Interval,
} from "@/components/domain/time-geometry";
import { wallClockMinutes } from "@/lib/format";

const NINE_TO_FOUR = windowFromHours(9, 16);
const t = (clock: string) => parseClock(clock) as number;
const span = (start: string, end: string): Interval => ({ start: t(start), end: t(end) });

describe("parseClock", () => {
  it.each([
    ["10:30", 630],
    ["9:05", 545],
    ["09:05", 545],
    ["1030", 630],
    ["0000", 0],
    ["00:00", 0],
    ["23:59", 1439],
    ["24:00", 1440],
    [" 14:30 ", 870],
  ])("%s → %i", (input, minutes) => {
    expect(parseClock(input)).toBe(minutes);
  });

  it.each(["", "TBA", "10:60", "25:00", "24:01", "1:5", "10.30", "-1:00"])("%s → null", (input) => {
    expect(parseClock(input)).toBeNull();
  });

  it("handles missing values", () => {
    expect(parseClock(null)).toBeNull();
    expect(parseClock(undefined)).toBeNull();
  });

  it("parses intervals and rejects inverted ones", () => {
    expect(parseInterval("10:30", "11:20")).toEqual({ start: 630, end: 680 });
    expect(parseInterval("23:59", "23:59")).toEqual({ start: 1439, end: 1439 });
    expect(parseInterval("11:20", "10:30")).toBeNull();
    expect(parseInterval(null, "10:30")).toBeNull();
  });
});

describe("parseSpan", () => {
  it.each([
    // [start, end, expected]
    ["10:30", "11:20", { start: 630, end: 680, shownEnd: 680, pastMidnight: false }],
    ["23:59", "23:59", { start: 1439, end: 1439, shownEnd: 1439, pastMidnight: false }],
    // A late ICS event runs to 24:00 on this day, and says when it really ends.
    ["22:00", "00:30", { start: 1320, end: 1440, shownEnd: 30, pastMidnight: true }],
    ["23:30", "00:00", { start: 1410, end: 1440, shownEnd: 0, pastMidnight: true }],
    ["13:00", "01:00", { start: 780, end: 1440, shownEnd: 60, pastMidnight: true }],
    // More than 12 hours "past midnight" is bad data, not a late event.
    ["11:20", "10:30", null],
    ["18:00", "17:00", null],
    ["TBA", "10:30", null],
    ["10:30", null, null],
  ] as const)("%s–%s", (start, end, expected) => {
    expect(parseSpan(start, end)).toEqual(expected);
  });
});

describe("labels", () => {
  it.each([
    [0, "12:00a"],
    [552, "9:12a"],
    [630, "10:30a"],
    [720, "12:00p"],
    [735, "12:15p"],
    [1170, "7:30p"],
    [1439, "11:59p"],
    [1440, "12:00a"],
  ])("clockLabel(%i) = %s", (minutes, label) => {
    expect(clockLabel(minutes)).toBe(label);
  });

  it.each([
    [0, "12a", "12"],
    [9, "9a", "9"],
    [12, "12p", "12"],
    [13, "1p", "1"],
    [16, "4p", "4"],
    [23, "11p", "11"],
    [24, "12a", "12"],
  ])("hour %i → %s / %s", (hour, label, short) => {
    expect(hourLabel(hour)).toBe(label);
    expect(shortHourLabel(hour)).toBe(short);
  });

  it("labels a window", () => {
    expect(windowLabel(9, 16)).toBe("9a–4p");
    expect(windowLabel(8, 22)).toBe("8a–10p");
  });

  it.each([
    [130, "2 h 10 m"],
    [78, "1 h 18 m"],
    [60, "1 h"],
    [120, "2 h"],
    [45, "45 m"],
    [0, "0 m"],
    [-5, "0 m"],
    [29.6, "30 m"],
  ])("formatDuration(%d) = %s", (minutes, label) => {
    expect(formatDuration(minutes)).toBe(label);
  });
});

describe("windows and scales", () => {
  it("builds a window from whole hours and lists its axis hours", () => {
    expect(NINE_TO_FOUR).toEqual({ start: 540, end: 960 });
    expect(axisHours(NINE_TO_FOUR)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(windowFromHours(0, 24)).toEqual({ start: 0, end: 1440 });
  });

  it("rejects an empty window", () => {
    expect(() => windowFromHours(16, 9)).toThrow(RangeError);
    expect(() => windowFromHours(9, 9)).toThrow(RangeError);
  });

  it.each([
    // minute, pxPerHour, px
    [540, 66, 0], // 9:00, top
    [552, 66, 13.2], // 9:12 now-line
    [630, 66, 99], // 10:30 CSC 221
    [870, 66, 363], // 2:30 ENV 237
    [960, 66, 462], // 4:00, bottom
    [480, 66, -66], // 8:00, above the window: not clamped
    [630, 49.2, 73.8], // week grid scale
  ])("minutesToPx(%i @ %d px/h) = %d, and back", (minute, pxPerHour, px) => {
    expect(minutesToPx(minute, NINE_TO_FOUR, pxPerHour)).toBeCloseTo(px, 6);
    expect(pxToMinutes(px, NINE_TO_FOUR, pxPerHour)).toBeCloseTo(minute, 6);
  });

  it("measures the window and converts to fractions and CSS percentages", () => {
    expect(windowHeightPx(NINE_TO_FOUR, 66)).toBe(462);
    expect(toFraction(540, NINE_TO_FOUR)).toBe(0);
    expect(toFraction(960, NINE_TO_FOUR)).toBe(1);
    expect(toFraction(750, NINE_TO_FOUR)).toBe(0.5);
    expect(percent(toFraction(630, NINE_TO_FOUR))).toBe("21.4286%");
    expect(percent(0.5)).toBe("50%");
  });

  it("stretches a window to fit evening and early items", () => {
    expect(windowForItems([span("10:30", "11:20")], 9, 16)).toEqual({ start: 540, end: 960 });
    // A 7:00–8:30p club meeting stretches the view to 9p.
    expect(windowForItems([span("19:00", "20:30")], 9, 16)).toEqual({ start: 540, end: 1260 });
    // An 8:05 class starts the view at 8a.
    expect(windowForItems([span("08:05", "09:20")], 9, 16)).toEqual({ start: 480, end: 960 });
    // A late deadline stays inside the day.
    expect(windowForItems([span("23:59", "23:59")], 9, 16)).toEqual({ start: 540, end: 1440 });
  });
});

describe("clampToWindow", () => {
  it.each<[string, Interval, ReturnType<typeof clampToWindow>]>([
    [
      "inside",
      span("10:30", "11:20"),
      { start: 630, end: 680, clippedStart: false, clippedEnd: false },
    ],
    [
      "crossing the top edge",
      span("08:00", "09:50"),
      { start: 540, end: 590, clippedStart: true, clippedEnd: false },
    ],
    [
      "crossing the bottom edge",
      span("15:30", "17:00"),
      { start: 930, end: 960, clippedStart: false, clippedEnd: true },
    ],
    [
      "covering the whole window",
      span("08:00", "18:00"),
      { start: 540, end: 960, clippedStart: true, clippedEnd: true },
    ],
    ["an evening item", span("19:00", "20:30"), null],
    ["ending exactly at the top edge", span("08:00", "09:00"), null],
    ["starting exactly at the bottom edge", span("16:00", "17:00"), null],
    [
      "a deadline inside",
      span("11:59", "11:59"),
      { start: 719, end: 719, clippedStart: false, clippedEnd: false },
    ],
    [
      "a deadline on the bottom edge",
      span("16:00", "16:00"),
      { start: 960, end: 960, clippedStart: false, clippedEnd: false },
    ],
    ["a deadline at 11:59p", span("23:59", "23:59"), null],
  ])("%s", (_name, interval, expected) => {
    expect(clampToWindow(interval, NINE_TO_FOUR)).toEqual(expected);
  });

  it("says which side of the window an item falls on", () => {
    expect(windowPosition(span("07:00", "08:00"), NINE_TO_FOUR)).toBe("before");
    expect(windowPosition(span("08:00", "09:00"), NINE_TO_FOUR)).toBe("before");
    expect(windowPosition(span("08:30", "08:30"), NINE_TO_FOUR)).toBe("before");
    expect(windowPosition(span("10:00", "11:00"), NINE_TO_FOUR)).toBe("inside");
    expect(windowPosition(span("16:00", "17:00"), NINE_TO_FOUR)).toBe("after");
    expect(windowPosition(span("23:59", "23:59"), NINE_TO_FOUR)).toBe("after");
  });
});

describe("overlaps and lanes", () => {
  it("treats touching spans as not overlapping", () => {
    expect(overlaps(span("10:30", "11:20"), span("11:20", "12:10"))).toBe(false);
    expect(overlaps(span("10:30", "11:20"), span("11:00", "12:10"))).toBe(true);
    expect(overlaps(span("10:30", "11:20"), span("10:30", "11:20"))).toBe(true);
  });

  type Item = Interval & { id: string };
  const item = (id: string, start: string, end: string): Item => ({ id, ...span(start, end) });
  const lanesOf = (items: Item[]) =>
    Object.fromEntries([...assignLanes(items)].map(([id, a]) => [id, [a.lane, a.lanes]]));

  it.each<[string, Item[], Record<string, [number, number]>]>([
    [
      "the mockup Wednesday: nothing overlaps",
      [item("csc", "10:30", "11:20"), item("eco", "11:30", "12:20"), item("env", "14:30", "15:45")],
      { csc: [0, 1], eco: [0, 1], env: [0, 1] },
    ],
    [
      "two overlapping classes split the width",
      [item("eng", "09:40", "10:55"), item("che", "10:00", "11:15")],
      { eng: [0, 2], che: [1, 2] },
    ],
    [
      "back-to-back classes share a lane",
      [item("a", "10:30", "11:20"), item("b", "11:20", "12:10")],
      { a: [0, 1], b: [0, 1] },
    ],
    [
      "a chain reuses the first lane once it frees up",
      // a overlaps b, b overlaps c, a and c do not: two lanes for the whole group.
      [item("a", "09:00", "10:00"), item("b", "09:30", "11:00"), item("c", "10:00", "10:30")],
      { a: [0, 2], b: [1, 2], c: [0, 2] },
    ],
    [
      "three at once need three lanes; a later item is its own group",
      [
        item("x", "13:00", "14:00"),
        item("y", "13:15", "14:15"),
        item("z", "13:30", "14:30"),
        item("later", "19:00", "20:30"),
      ],
      { x: [0, 3], y: [1, 3], z: [2, 3], later: [0, 1] },
    ],
    [
      "the longer of two same-start items takes the first lane",
      [item("short", "10:00", "10:50"), item("long", "10:00", "11:15")],
      { long: [0, 2], short: [1, 2] },
    ],
    [
      "identical items are ordered by id",
      [item("b", "10:00", "11:00"), item("a", "10:00", "11:00")],
      { a: [0, 2], b: [1, 2] },
    ],
  ])("%s", (_name, items, expected) => {
    expect(lanesOf(items)).toEqual(expected);
  });

  it("is stable: the same items get the same lanes in any order", () => {
    const items = [
      item("eng", "09:40", "10:55"),
      item("che", "10:00", "11:15"),
      item("his", "10:30", "11:45"),
      item("csc", "11:15", "12:05"),
      item("eco", "13:00", "14:00"),
    ];
    const expected = lanesOf(items);
    expect(lanesOf([...items].reverse())).toEqual(expected);
    expect(lanesOf([items[2]!, items[4]!, items[0]!, items[3]!, items[1]!])).toEqual(expected);
  });

  it("gives zero-length items no lane", () => {
    expect(lanesOf([item("due", "11:59", "11:59"), item("csc", "10:30", "11:20")])).toEqual({
      csc: [0, 1],
    });
  });
});

describe("free gaps", () => {
  const wednesday = [span("10:30", "11:20"), span("11:30", "12:20"), span("14:30", "15:45")];

  it("finds the 2 h 10 m lunch gap on the mockup Wednesday, not the 10-minute changeover", () => {
    expect(findFreeGaps(wednesday, NINE_TO_FOUR)).toEqual([{ start: 740, end: 870 }]);
    expect(formatDuration(870 - 740)).toBe("2 h 10 m");
  });

  it("honours the minimum gap length", () => {
    expect(findFreeGaps(wednesday, NINE_TO_FOUR, { minMinutes: 10 })).toEqual([
      { start: 680, end: 690 },
      { start: 740, end: 870 },
    ]);
    expect(findFreeGaps(wednesday, NINE_TO_FOUR, { minMinutes: 131 })).toEqual([]);
  });

  it("does not count time before the first or after the last item", () => {
    expect(findFreeGaps([span("10:30", "11:20")], NINE_TO_FOUR)).toEqual([]);
    expect(findFreeGaps([], NINE_TO_FOUR)).toEqual([]);
  });

  it("merges overlapping items before looking for gaps", () => {
    expect(
      findFreeGaps(
        [span("09:40", "10:55"), span("10:00", "11:15"), span("13:00", "14:00")],
        NINE_TO_FOUR,
      ),
    ).toEqual([{ start: 675, end: 780 }]);
  });

  it("ignores deadlines and clamps items that cross the window edge", () => {
    expect(
      findFreeGaps(
        [span("08:00", "09:30"), span("11:59", "11:59"), span("15:30", "17:00")],
        NINE_TO_FOUR,
      ),
    ).toEqual([{ start: 570, end: 930 }]);
    // An evening event outside the window bounds no gap inside it.
    expect(findFreeGaps([span("10:30", "11:20"), span("19:00", "20:30")], NINE_TO_FOUR)).toEqual(
      [],
    );
  });

  it("merges touching and nested spans", () => {
    expect(
      mergeIntervals([span("11:00", "12:00"), span("10:00", "11:00"), span("10:15", "10:45")]),
    ).toEqual([{ start: 600, end: 720 }]);
  });
});

describe("now line", () => {
  it.each([
    [552, 12 / 420], // 9:12
    [540, 0],
    [960, 1],
    [539, null], // 8:59, before the view
    [1170, null], // 7:30p, after it
  ])("nowLinePosition(%i)", (minute, expected) => {
    const position = nowLinePosition(minute, NINE_TO_FOUR);
    if (expected === null) expect(position).toBeNull();
    else expect(position).toBeCloseTo(expected, 10);
  });
});

describe("wall-clock minutes are DST-agnostic", () => {
  it.each([
    ["2026-09-30T13:12:00Z", 552], // 9:12 EDT
    ["2026-10-01T01:30:00Z", 1290], // 9:30 PM on Sep 30, EDT
    ["2026-11-01T05:30:00Z", 90], // 1:30 EDT, before the fall-back
    ["2026-11-01T06:30:00Z", 90], // 1:30 EST, the repeated hour
    ["2026-11-02T15:30:00Z", 630], // 10:30 EST: a 10:30 class stays at 10:30
    ["2027-03-14T06:59:00Z", 119], // 1:59 EST
    ["2027-03-14T07:00:00Z", 180], // 3:00 EDT: 2 AM never happens
    ["2027-03-15T14:30:00Z", 630], // 10:30 EDT
    ["2026-09-30T04:00:00Z", 0], // midnight
  ])("%s → %i", (iso, minutes) => {
    expect(wallClockMinutes(new Date(iso), "America/New_York")).toBe(minutes);
  });

  it("uses the zone it is given", () => {
    expect(wallClockMinutes(new Date("2026-09-30T13:12:00Z"), "UTC")).toBe(792);
  });

  it("places a 10:30 class at the same height before and after the DST change", () => {
    const before = minutesToPx(
      wallClockMinutes(new Date("2026-10-30T14:30:00Z")),
      NINE_TO_FOUR,
      66,
    );
    const after = minutesToPx(wallClockMinutes(new Date("2026-11-02T15:30:00Z")), NINE_TO_FOUR, 66);
    expect(before).toBe(99);
    expect(after).toBe(99);
  });
});
