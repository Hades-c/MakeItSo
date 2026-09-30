import { describe, expect, it } from "vitest";
import * as catalog from "@/server/catalog";
import * as feeds from "@/server/feeds";
import { ApiError } from "@/server/http";
import * as plan from "@/server/plan";
import * as programs from "@/server/programs";

/**
 * The frozen service surfaces (PLAN §4.1.3–7). Until each workstream lands, every export is a typed stub that
 * throws ApiError(501, "unavailable"). This test pins the export names so a rename is a visible contract change.
 * Implemented services leave this list and pin their names in their own tests (server/rmp: tests/rmp).
 */
const SURFACES = {
  catalog: [
    catalog,
    [
      "countCourses",
      "getCatalogFilters",
      "getCourse",
      "getCourseHistory",
      "getSection",
      "resolveTerms",
      "searchCourses",
      "validateCourseCodes",
    ],
  ],
  plan: [
    plan,
    [
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
    ],
  ],
  feeds: [feeds, ["getLibraryHours", "listEvents", "syncFeeds"]],
  programs: [programs, ["getProgram", "listPrograms", "officialProgramNames", "syncPrograms"]],
} as const;

describe("service stubs", () => {
  for (const [name, [module, exports]] of Object.entries(SURFACES)) {
    it(`server/${name} exports exactly its frozen functions, each a 501 until implemented`, async () => {
      const functions = Object.entries(module as Record<string, unknown>).filter(
        ([, value]) => typeof value === "function",
      );
      expect(functions.map(([key]) => key).sort()).toEqual([...exports].sort());
      for (const [key, fn] of functions) {
        let error: unknown;
        try {
          await (fn as (...args: unknown[]) => unknown)();
        } catch (e) {
          error = e;
        }
        expect(error, key).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 501, code: "unavailable" });
        expect((error as Error).message).toBe(`${key} is not implemented yet.`);
      }
    });
  }
});
