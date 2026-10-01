import type { PlanItem } from "@/lib/types/plan";

/** Pure test data for the plan engine (no database). */

let idCounter = 0;

/** A PlanItem for pure tests (defaults: a completed 1-credit catalog course in Fall 2024). */
export function item(overrides: Partial<PlanItem> & { courseCode: string }): PlanItem {
  idCounter += 1;
  return {
    id: overrides.id ?? idCounter.toString(16).padStart(24, "0"),
    termCode: "202401",
    canonicalCode: overrides.courseCode,
    title: overrides.courseCode,
    credits: 1,
    status: "completed",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...overrides,
  };
}
