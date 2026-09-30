import { describe, expect, it } from "vitest";
import * as plan from "@/server/plan";

/**
 * The plan service surface (PLAN §4.1.4): the frozen functions of server/plan/index.ts, plus getPlanCredits (the
 * shell's "My plan x/32") and getWebTreeReport (the Next semester tab). A rename is a visible contract change.
 */
const FROZEN = [
  "addDeadline",
  "addItem",
  "addSummerActivity",
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
