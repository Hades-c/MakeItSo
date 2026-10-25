import { describe, expect, it } from "vitest";
import { currentTermFrom, termPhaseFrom } from "@/lib/term";
import { PLAN_STATUSES } from "@/lib/types/plan";
import { isTermResult, isUnfinishedTermResult, termPhase } from "@/server/plan/status-rules";
import { FIXTURE_TERMS, fixtureClock } from "../helpers/terms";

/** The one rule for a term result recorded before it can be true (server/plan/status-rules.ts). */

describe("termPhase", () => {
  it("reads the term's own dates in New York time, summer terms too", () => {
    // Fall 2026: 2026-08-24 to 2026-12-15.
    expect(termPhase("202601", fixtureClock("2026-08-23T23:59:00-04:00"))).toBe("not-started");
    expect(termPhase("202601", fixtureClock("2026-08-24T00:00:00-04:00"))).toBe("in-session");
    expect(termPhase("202601", fixtureClock("2026-12-15T23:59:00-05:00"))).toBe("in-session");
    expect(termPhase("202601", fixtureClock("2026-12-16T00:00:00-05:00"))).toBe("over");
    // Summer 2026: 2026-05-19 to 2026-08-14, while Spring 2026 stays the current term.
    expect(termPhase("202503", fixtureClock("2026-07-01T12:00:00-04:00"))).toBe("in-session");
    expect(termPhase("202503", fixtureClock("2026-08-20T12:00:00-04:00"))).toBe("over");
    expect(termPhaseFrom(FIXTURE_TERMS, "202503", { now: "2026-05-01T12:00:00Z" })).toBe(
      "not-started",
    );
  });

  it("falls back to the order against the current term for a term without dates", () => {
    const undated = { terms: [], at: new Date("2026-09-30T12:00:00-04:00") };
    expect(termPhaseFrom([], "202601", { now: undated.at })).toBeNull();
    expect(termPhase("202502", undated)).toBe("over");
    expect(termPhase("202601", undated)).toBe("in-session");
    expect(termPhase("202602", undated)).toBe("not-started");
    // Terms beyond either end of a dated list.
    expect(termPhase("203001", fixtureClock())).toBe("not-started");
    expect(termPhase("199901", fixtureClock())).toBe("over");
  });
});

describe("isUnfinishedTermResult", () => {
  it("holds for completed, failed and withdrawn in a term that has not begun, and nothing else", () => {
    const clock = fixtureClock();
    for (const status of PLAN_STATUSES) {
      const result = isTermResult(status);
      expect(isUnfinishedTermResult({ status, termCode: "202602" }, clock), status).toBe(result);
      // A term that has ended: a real result.
      expect(isUnfinishedTermResult({ status, termCode: "202502" }, clock), status).toBe(false);
      // Pre-matriculation credit has no term.
      expect(isUnfinishedTermResult({ status, termCode: null }, clock), status).toBe(false);
    }
    expect(PLAN_STATUSES.filter(isTermResult)).toEqual(["completed", "failed", "withdrawn"]);
  });

  it("flags completed and failed in the term in session, but not a withdrawal (a W is taken during the term)", () => {
    const clock = fixtureClock("2026-10-25T12:00:00-04:00");
    expect(isUnfinishedTermResult({ status: "completed", termCode: "202601" }, clock)).toBe(true);
    expect(isUnfinishedTermResult({ status: "failed", termCode: "202601" }, clock)).toBe(true);
    expect(isUnfinishedTermResult({ status: "withdrawn", termCode: "202601" }, clock)).toBe(false);
    expect(isUnfinishedTermResult({ status: "withdrawn", termCode: "202602" }, clock)).toBe(true);
  });

  it("goes by the end date: Fall 2026 Completed is fine from Dec 16, while Fall stays the current term", () => {
    const item = { status: "completed" as const, termCode: "202601" };
    const dec20 = fixtureClock("2026-12-20T12:00:00-05:00");
    expect(currentTermFrom(FIXTURE_TERMS, { now: dec20.at })).toBe("202601");
    expect(isUnfinishedTermResult(item, dec20)).toBe(false);
    expect(isUnfinishedTermResult(item, fixtureClock("2026-12-15T20:00:00-05:00"))).toBe(true);
    // Spring 2027 has not begun.
    expect(isUnfinishedTermResult({ status: "completed", termCode: "202602" }, dec20)).toBe(true);
  });

  it("goes by the end date: Spring 2027 Completed is fine all summer, before Fall 2027 is current", () => {
    const item = { status: "completed" as const, termCode: "202602" };
    const june15 = fixtureClock("2027-06-15T12:00:00-04:00");
    expect(currentTermFrom(FIXTURE_TERMS, { now: june15.at })).toBe("202602");
    expect(isUnfinishedTermResult(item, june15)).toBe(false);
    expect(isUnfinishedTermResult(item, fixtureClock("2027-05-12T12:00:00-04:00"))).toBe(true);
  });

  it("judges a summer term by its own dates, though it is never the current term", () => {
    // Summer 2026 (202503) is after Spring 2026, which stays current until Fall starts.
    const july = fixtureClock("2026-07-01T12:00:00-04:00");
    expect(currentTermFrom(FIXTURE_TERMS, { now: july.at })).toBe("202502");
    expect(isUnfinishedTermResult({ status: "completed", termCode: "202503" }, july)).toBe(true);
    expect(isUnfinishedTermResult({ status: "withdrawn", termCode: "202503" }, july)).toBe(false);
    const after = fixtureClock("2026-08-20T12:00:00-04:00");
    expect(currentTermFrom(FIXTURE_TERMS, { now: after.at })).toBe("202502");
    expect(isUnfinishedTermResult({ status: "completed", termCode: "202503" }, after)).toBe(false);
    expect(isUnfinishedTermResult({ status: "failed", termCode: "202503" }, after)).toBe(false);
  });

  it("falls back to the date's current term without a terms list", () => {
    const clock = { terms: [], at: new Date("2026-10-25T12:00:00-04:00") };
    expect(isUnfinishedTermResult({ status: "completed", termCode: "202601" }, clock)).toBe(true);
    expect(isUnfinishedTermResult({ status: "completed", termCode: "202502" }, clock)).toBe(false);
    expect(isUnfinishedTermResult({ status: "withdrawn", termCode: "202601" }, clock)).toBe(false);
  });
});
