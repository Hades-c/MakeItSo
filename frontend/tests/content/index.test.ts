import { describe, expect, it } from "vitest";
import * as content from "@/server/content";
import { curatedSourceVerifiedAt } from "@/server/content";
import { foldText } from "@/server/content/define";

describe("server/content barrel", () => {
  it("exports every module's data and helpers", () => {
    for (const name of [
      "ACADEMIC_CALENDAR",
      "upcomingCalendar",
      "deadlinesBetween",
      "GRADUATION_RULES",
      "REQUIREMENT_CODES",
      "resolveGraduationRules",
      "CAREERS",
      "getCareer",
      "careersByCluster",
      "ALUMNI",
      "alumniForCareer",
      "OFFICES",
      "PROGRAMS",
      "getOffice",
      "PORTAL_LINKS",
      "getLink",
      "HANDSHAKE",
      "davidsonDay",
    ]) {
      expect([name, name in content]).toEqual([name, true]);
    }
  });

  it("dates each curated source for the Sources panel", () => {
    for (const source of [
      "registrar",
      "matthews-center",
      "hurt-hub-programs",
      "davidson-offices",
    ] as const) {
      expect([source, curatedSourceVerifiedAt(source)]).toEqual([source, "2026-09-30"]);
    }
  });

  it("folds text for matching", () => {
    expect(foldText("  Tomás   Quintero ")).toBe("tomas quintero");
    expect(foldText("UX & Interaction Design")).toBe("ux and interaction design");
  });
});
