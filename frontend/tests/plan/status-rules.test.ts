import { describe, expect, it } from "vitest";
import { PLAN_STATUSES } from "@/lib/types/plan";
import { isTermResult, isUnfinishedTermResult } from "@/server/plan/status-rules";

/** The one rule for a term result recorded before its term is over (server/plan/status-rules.ts). */

describe("isUnfinishedTermResult", () => {
  it("holds for completed, failed and withdrawn in the current term or later, and nothing else", () => {
    const current = "202601";
    for (const status of PLAN_STATUSES) {
      const result = isTermResult(status);
      expect(isUnfinishedTermResult({ status, termCode: "202601" }, current), status).toBe(result);
      expect(isUnfinishedTermResult({ status, termCode: "202602" }, current), status).toBe(result);
      // A term that has ended: a real result.
      expect(isUnfinishedTermResult({ status, termCode: "202502" }, current), status).toBe(false);
      // Pre-matriculation credit has no term.
      expect(isUnfinishedTermResult({ status, termCode: null }, current), status).toBe(false);
    }
    expect(PLAN_STATUSES.filter(isTermResult)).toEqual(["completed", "failed", "withdrawn"]);
  });

  it("follows the current term: Spring 2027 Completed is fine once Spring 2027 is over", () => {
    const item = { status: "completed" as const, termCode: "202602" };
    expect(isUnfinishedTermResult(item, "202602")).toBe(true);
    expect(isUnfinishedTermResult(item, "202701")).toBe(false);
  });
});
