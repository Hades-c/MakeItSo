import { describe, expect, it } from "vitest";
import * as plan from "@/server/plan";

/**
 * The plan service surface (PLAN §4.1.4): the frozen functions of server/plan/index.ts, plus getPlanCredits (the
 * shell's "My plan x/32") and getWebTreeReport (the Next semester tab). A rename is a visible contract change.
 * addSyllabusDeadlines / removeDeadlinesBySyllabus (PLAN-UX §3 /syllabi) are the one deliberate addition since:
 * the review-before-save step and a syllabus's replace/delete need a bulk add and a by-syllabus remove that a
 * single addDeadline/removeDeadline cannot do atomically.
 */
const FROZEN = [
  "addDeadline",
  "addItem",
  "addSummerActivity",
  "addSyllabusDeadlines",
  "detectConflicts",
  "getDaySchedule",
  "getPlan",
  "getProgress",
  "getWebTreeList",
  "listDeadlines",
  "listDrafts",
  "listSummerActivities",
  "readLegacyPlan",
  "removeDeadline",
  "removeDeadlinesBySyllabus",
  "removeItem",
  "removeSummerActivity",
  "saveDraft",
  "saveWebTreeList",
  "updateDraftStatus",
  "updateItem",
  "updateManual",
  "updateSummerActivity",
];

describe("server/plan surface", () => {
  it("exports exactly the frozen functions plus getPlanCredits and getWebTreeReport", () => {
    const functions = Object.entries(plan)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort();
    expect(functions).toEqual([...FROZEN, "getPlanCredits", "getWebTreeReport"].sort());
  });
});
