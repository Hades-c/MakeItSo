import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classStanding,
  compareTerms,
  currentTermFrom,
  isRegularTerm,
  isSummer,
  isTermCode,
  nextRegularTerm,
  parseTermCode,
  prevRegularTerm,
  registrationTermFrom,
  termCodeFor,
  termFromDateET,
  termLabel,
  termSeason,
  termsBetween,
  type TermScheduleEntry,
} from "@/lib/term";

interface UpstreamTerm {
  term_code: string;
  is_active: boolean;
  is_summer: boolean;
  start_date: number | null;
  end_date: number | null;
}

/** The real Davidson terms list (api.davidson.edu/api/public/v2/terms, fetched 2026-09-30). */
const upstream = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/external/course-schedule/terms.json", import.meta.url)),
    "utf8",
  ),
) as UpstreamTerm[];

const TERMS: TermScheduleEntry[] = upstream.map((t) => ({
  code: t.term_code,
  isSummer: t.is_summer,
  isActive: t.is_active,
  startDate: t.start_date,
  endDate: t.end_date,
}));

afterEach(() => {
  vi.useRealTimers();
});

describe("term codes", () => {
  it("maps YYYY01 to Fall YYYY, YYYY02 to Spring YYYY+1 and YYYY03 to Summer YYYY+1", () => {
    expect(parseTermCode("202601")).toEqual({
      code: "202601",
      season: "Fall",
      year: 2026,
      label: "Fall 2026",
    });
    expect(termLabel("202602")).toBe("Spring 2027");
    expect(termLabel("202502")).toBe("Spring 2026");
    expect(parseTermCode("202503")).toEqual({
      code: "202503",
      season: "Summer",
      year: 2026,
      label: "Summer 2026",
    });
    expect(termLabel("202603")).toBe("Summer 2027");
  });

  it("rejects anything else", () => {
    for (const bad of ["202604", "202600", "20260", "2026-01", "abc", "", " 202601"]) {
      expect(isTermCode(bad)).toBe(false);
      expect(parseTermCode(bad)).toBeNull();
      expect(isSummer(bad)).toBe(false);
      expect(isRegularTerm(bad)).toBe(false);
    }
    expect(isTermCode(202601)).toBe(false);
    expect(termLabel("nope")).toBe("nope");
    expect(() => termSeason("nope")).toThrow(RangeError);
    expect(() => compareTerms("202601", "x")).toThrow(RangeError);
    expect(() => nextRegularTerm("2026")).toThrow(RangeError);
  });

  it("knows seasons, summers and regular terms", () => {
    expect(termSeason("202601")).toBe("Fall");
    expect(termSeason("202602")).toBe("Spring");
    expect(termSeason("202503")).toBe("Summer");
    expect(isSummer("202503")).toBe(true);
    expect(isSummer("202601")).toBe(false);
    expect(isRegularTerm("202602")).toBe(true);
    expect(isRegularTerm("202603")).toBe(false);
  });

  it("compares chronologically", () => {
    const shuffled = ["202601", "202503", "202402", "202602", "202501", "202502"];
    expect([...shuffled].sort(compareTerms)).toEqual([
      "202402",
      "202501",
      "202502",
      "202503",
      "202601",
      "202602",
    ]);
    expect(compareTerms("202601", "202601")).toBe(0);
  });

  it.each([
    ["202601", "202602", "202502"],
    ["202602", "202701", "202601"],
    ["202503", "202601", "202502"],
    ["202501", "202502", "202402"],
    ["199902", "200001", "199901"],
  ])("next/previous regular term of %s", (code, next, prev) => {
    expect(nextRegularTerm(code)).toBe(next);
    expect(prevRegularTerm(code)).toBe(prev);
  });

  it("builds codes from a season and calendar year", () => {
    expect(termCodeFor("Fall", 2026)).toBe("202601");
    expect(termCodeFor("Spring", 2027)).toBe("202602");
    expect(termCodeFor("Summer", 2026)).toBe("202503");
    expect(() => termCodeFor("Fall", 26.5)).toThrow(RangeError);
  });

  it("lists the terms between two codes, inclusive", () => {
    expect(termsBetween("202501", "202602")).toEqual(["202501", "202502", "202601", "202602"]);
    expect(termsBetween("202501", "202602", { includeSummer: true })).toEqual([
      "202501",
      "202502",
      "202503",
      "202601",
      "202602",
    ]);
    expect(termsBetween("202503", "202503")).toEqual([]);
    expect(termsBetween("202503", "202503", { includeSummer: true })).toEqual(["202503"]);
    expect(termsBetween("202602", "202601")).toEqual([]);
    expect(termsBetween("202201", "202602")).toHaveLength(10);
  });
});

describe("termFromDateET (fallback)", () => {
  it.each([
    ["2026-09-30T12:00:00Z", "202601"],
    ["2027-01-10T12:00:00Z", "202602"],
    ["2026-06-15T12:00:00Z", "202503"],
    ["2026-05-31T12:00:00Z", "202502"],
    // 2026-08-01 00:30 UTC is still July 31 in New York.
    ["2026-08-01T00:30:00Z", "202503"],
    ["2027-01-01T04:59:00Z", "202601"],
  ])("%s → %s", (date, code) => {
    expect(termFromDateET(date)).toBe(code);
  });
});

describe("currentTermFrom / registrationTermFrom (fixture terms list, fake clocks)", () => {
  it.each([
    // [now, current, registration]
    ["2026-09-30T14:00:00Z", "202601", "202602"],
    ["2026-12-20T15:00:00Z", "202601", "202602"],
    ["2027-02-01T15:00:00Z", "202602", "202701"],
    // First and last day of Fall 2026 (2026-08-24 .. 2026-12-15), in New York time.
    ["2026-08-24T04:00:00Z", "202601", "202602"],
    ["2026-12-16T04:59:00Z", "202601", "202602"],
    // The evening before Fall starts is still "after Spring 2026".
    ["2026-08-24T03:59:00Z", "202502", "202601"],
    // Summer and spring: registration is the next Fall, never the summer term (raw is_next points at summer).
    ["2026-06-15T12:00:00Z", "202502", "202601"],
    ["2026-04-10T12:00:00Z", "202502", "202601"],
    ["2027-05-20T12:00:00Z", "202602", "202701"],
  ])("at %s: current %s, registration %s", (now, current, registration) => {
    expect(currentTermFrom(TERMS, { now })).toBe(current);
    expect(registrationTermFrom(TERMS, { now })).toBe(registration);
  });

  it("works with a faked system clock too", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T16:00:00Z"));
    expect(currentTermFrom(TERMS, { now: new Date() })).toBe("202601");
    expect(registrationTermFrom(TERMS, { now: Date.now() })).toBe("202602");
  });

  it("accepts TermInfo-style YYYY-MM-DD dates", () => {
    const terms: TermScheduleEntry[] = [
      { code: "202601", startDate: "2026-08-24", endDate: "2026-12-15" },
      { code: "202602", startDate: "2027-01-19", endDate: "2027-05-12" },
      { code: "202603", startDate: "2027-05-19", endDate: "2027-08-10" },
    ];
    expect(currentTermFrom(terms, { now: "2027-06-01T12:00:00Z" })).toBe("202602");
    expect(registrationTermFrom(terms, { now: "2027-06-01T12:00:00Z" })).toBe("202701");
  });

  it("never returns a summer term, even when upstream flags one active", () => {
    const terms: TermScheduleEntry[] = [
      { code: "202503", isSummer: true, isActive: true },
      { code: "202502", isActive: false },
    ];
    expect(currentTermFrom(terms, { now: "2026-07-01T12:00:00Z" })).toBe("202502");
  });

  it("falls back to the isActive hint, then to the date, without usable dates", () => {
    expect(
      currentTermFrom([{ code: "202601", isActive: true }, { code: "202602" }], {
        now: "2027-03-01T12:00:00Z",
      }),
    ).toBe("202601");
    expect(currentTermFrom([], { now: "2027-03-01T12:00:00Z" })).toBe("202602");
    expect(currentTermFrom([], { now: "2026-07-01T12:00:00Z" })).toBe("202502");
    expect(registrationTermFrom([], { now: "2026-07-01T12:00:00Z" })).toBe("202601");
  });

  it("ignores a stale list (only old terms) and uses the date", () => {
    const old = TERMS.filter((t) => t.code < "202301");
    expect(currentTermFrom(old, { now: "2026-09-30T12:00:00Z" })).toBe("202601");
  });
});

describe("classStanding", () => {
  const now = "2026-09-30T14:00:00Z";

  it.each([
    [2027, "senior"],
    [2028, "junior"],
    [2029, "sophomore"],
    [2030, "first-year"],
    [2031, "incoming"],
    [2035, "incoming"],
    [2026, "graduated"],
  ] as const)("class of %i on 2026-09-30 is %s (estimated)", (gradYear, standing) => {
    expect(classStanding(gradYear, now)).toEqual({ standing, estimated: true });
  });

  it("rolls over on June 1 (New York time)", () => {
    expect(classStanding(2026, "2026-05-20T12:00:00Z").standing).toBe("senior");
    expect(classStanding(2026, "2026-06-01T04:00:00Z").standing).toBe("graduated");
    expect(classStanding(2027, "2026-06-01T03:59:00Z").standing).toBe("junior");
    expect(classStanding(2027, "2026-06-01T04:00:00Z").standing).toBe("senior");
  });

  it("uses a student-set override as-is", () => {
    expect(classStanding(2030, now, "sophomore")).toEqual({
      standing: "sophomore",
      estimated: false,
    });
    expect(classStanding(2030, now, null)).toEqual({ standing: "first-year", estimated: true });
  });

  it("rejects a non-integer year", () => {
    expect(() => classStanding(Number.NaN, now)).toThrow(RangeError);
  });
});
