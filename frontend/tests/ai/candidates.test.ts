import { describe, expect, it } from "vitest";
import { withCatalogDb } from "../catalog/db";
import { makeCourse, makeSection } from "../rmp/helpers";
import {
  careerCandidates,
  careerTerms,
  planCandidates,
  recentTermsWithData,
  restrictionFlags,
} from "@/server/ai/candidates";
import {
  classYearIn,
  openRequirementCodes,
  takenCodes,
  termsUntilGraduation,
} from "@/server/ai/features/common";
import { resolveTerms, searchCourses } from "@/server/catalog";
import { getCareer } from "@/server/content/careers";
import { planItem, progressWith } from "./helpers";

/** Retrieval for the grounded features over the real fixture catalog (Fall 2026 current, Spring 2027 registration). */

withCatalogDb();

describe("plan-suggestion candidates", () => {
  it("are courses of the target term that fill an open requirement, most useful first", async () => {
    const candidates = await planCandidates({
      targetTerm: "202602",
      openCodes: ["SSRQ", "VPRQ"],
      taken: new Set(),
      classYear: 2,
      compMet: true,
    });
    expect(candidates.length).toBeGreaterThan(10);
    expect(candidates.length).toBeLessThanOrEqual(40);
    for (const c of candidates) {
      expect(c.fills.length).toBeGreaterThan(0);
      expect(c.fills.every((f) => f === "SSRQ" || f === "VPRQ")).toBe(true);
      expect(c.basis).toBe("scheduled");
      expect([...c.terms.entries()]).toEqual([["202602", "scheduled"]]);
      expect(c.openSeats).not.toBeNull();
    }
    // Unflagged first.
    const firstFlagged = candidates.findIndex((c) => c.flags.length > 0);
    if (firstFlagged >= 0)
      expect(candidates.slice(firstFlagged).every((c) => c.flags.length > 0)).toBe(true);
  });

  it("flags courses whose every section excludes the student's class year (flag, never block)", async () => {
    const candidates = await planCandidates({
      targetTerm: "202602",
      openCodes: ["VPRQ"],
      taken: new Set(),
      classYear: 2,
      compMet: true,
      limit: 200,
    });
    const art203 = candidates.find((c) => c.courseCode === "ART 203");
    expect(art203?.flags).toEqual(["restricted-standing"]);
    const forSenior = await planCandidates({
      targetTerm: "202602",
      openCodes: ["VPRQ"],
      taken: new Set(),
      classYear: 4,
      compMet: true,
      limit: 200,
    });
    expect(forSenior.find((c) => c.courseCode === "ART 203")?.flags).toEqual([]);
  });

  it("leaves out courses completed or planned, cross-listed siblings included", async () => {
    const all = await planCandidates({
      targetTerm: "202602",
      openCodes: ["NSRQ"],
      taken: new Set(),
      classYear: 2,
      compMet: true,
      limit: 200,
    });
    // MUS 116 and PHY 116 are one class: one candidate.
    const acoustics = all.filter((c) => c.courseCode === "MUS 116" || c.courseCode === "PHY 116");
    expect(acoustics).toHaveLength(1);
    expect(acoustics[0]!.siblings.length).toBe(1);
    const taken = takenCodes([
      planItem({ termCode: "202601", courseCode: "PHY 116", status: "planned" }),
    ]);
    const without = await planCandidates({
      targetTerm: "202602",
      openCodes: ["NSRQ"],
      taken,
      classYear: 2,
      compMet: true,
      limit: 200,
    });
    expect(without.some((c) => c.courseCode === "MUS 116" || c.courseCode === "PHY 116")).toBe(
      false,
    );
    expect(without.length).toBe(all.length - 1);
  });

  it("uses the last 4 published regular terms for an unpublished term, labelled as past offerings", async () => {
    const hasData = async (term: string) => (await searchCourses({ term, pageSize: 1 })).total > 0;
    expect(await recentTermsWithData("202701", 4, hasData)).toEqual([
      "202602",
      "202601",
      "202502",
      "202501",
    ]);
    const candidates = await planCandidates({
      targetTerm: "202701",
      openCodes: ["SSRQ"],
      taken: new Set(),
      classYear: 3,
      compMet: true,
    });
    expect(candidates.length).toBeGreaterThan(5);
    for (const c of candidates) {
      expect(c.basis).toBe("past-offerings");
      expect(c.terms.get("202701")).toBe("past-offerings");
      expect(c.ranIn.length).toBeGreaterThan(0);
      expect(c.openSeats).toBeNull();
    }
  });

  it("is empty without open requirements", async () => {
    expect(
      await planCandidates({
        targetTerm: "202602",
        openCodes: [],
        taken: new Set(),
        classYear: 2,
        compMet: true,
      }),
    ).toEqual([]);
  });
});

describe("restriction flags", () => {
  it("flags W sections once COMP is met, and permission-only courses", () => {
    const w = makeCourse("WRI 101", [
      makeSection({
        courseCode: "WRI 101",
        instructors: [],
        restrictions: {
          eligibleYears: null,
          untilFirstDay: false,
          permissionRequired: false,
          notIfCompMet: true,
        },
      }),
    ]);
    expect(restrictionFlags(w, 1, true)).toEqual(["comp-met-w-section"]);
    expect(restrictionFlags(w, 1, false)).toEqual([]);
    const prm = makeCourse("ART 496", [
      makeSection({
        courseCode: "ART 496",
        instructors: [],
        restrictions: {
          eligibleYears: [4],
          untilFirstDay: false,
          permissionRequired: true,
          notIfCompMet: false,
        },
      }),
    ]);
    expect(restrictionFlags(prm, 4, false)).toEqual(["permission-required"]);
    expect(restrictionFlags(prm, 3, false)).toEqual(["restricted-standing", "permission-required"]);
    expect(restrictionFlags(prm, null, false)).toEqual(["permission-required"]);
  });
});

describe("career-plan candidates", () => {
  it("are the career's curated courses the catalog knows plus registration-term department courses, with their terms", async () => {
    const resolved = await resolveTerms();
    const career = getCareer("software-engineering")!;
    const windowTerms = termsUntilGraduation("202602", 2029);
    expect(windowTerms).toEqual(["202602", "202701", "202702", "202801", "202802"]);
    const candidates = await careerCandidates({
      career,
      resolved,
      windowTerms,
      taken: new Set(["CSC 121"]),
    });
    expect(candidates.some((c) => c.courseCode === "CSC 121")).toBe(false);
    const csc221 = candidates.find((c) => c.courseCode === "CSC 221");
    expect(csc221?.curatedWhy).toBeTruthy();
    expect(csc221?.termList[0]).toEqual({ code: "202602", basis: "scheduled" });
    for (const c of candidates) {
      expect(c.termList.length).toBeGreaterThan(0);
      for (const t of c.termList) {
        expect(windowTerms).toContain(t.code);
        expect(t.basis).toBe(t.code === "202602" ? "scheduled" : "past-offerings");
      }
    }
    expect(candidates.some((c) => !c.curatedWhy && /^(CSC|MAT) /.test(c.courseCode))).toBe(true);
  });

  it("offers an unpublished term only when the course ran in that season lately", () => {
    const context = {
      published: new Set(["202501", "202502", "202601", "202602"]),
      recent: ["202602", "202601", "202502", "202501"],
    };
    const history = [
      { termCode: "202501", status: "offered" as const, sectionCount: 1 },
      { termCode: "202502", status: "not-offered" as const },
      { termCode: "202601", status: "offered" as const, sectionCount: 1 },
      { termCode: "202602", status: "not-offered" as const },
      { termCode: "202701", status: "not-yet-published" as const },
    ];
    expect(careerTerms(history, context, ["202602", "202701", "202702"])).toEqual([
      { code: "202701", basis: "past-offerings" },
    ]);
  });
});

describe("plan helpers", () => {
  it("reads open slots as requirement codes (PE is not in the course API)", () => {
    expect(openRequirementCodes(progressWith(["SSRQ", "PE", "COMP"])).sort()).toEqual([
      "COMP",
      "SSRQ",
    ]);
  });

  it("projects the class year into the target term", () => {
    expect(classYearIn("sophomore", "202601", "202602")).toBe(2);
    expect(classYearIn("sophomore", "202601", "202701")).toBe(3);
    expect(classYearIn("senior", "202601", "202701")).toBe(4);
    expect(classYearIn("incoming", "202601", "202602")).toBe(1);
    expect(classYearIn("graduated", "202601", "202602")).toBeNull();
  });

  it("counts active items only as taken, by listing and canonical code", () => {
    const taken = takenCodes([
      planItem({
        termCode: "202501",
        courseCode: "PSY 303",
        canonicalCode: "BIO 331",
        status: "completed",
      }),
      planItem({ termCode: "202501", courseCode: "CHE 115", status: "failed" }),
    ]);
    expect([...taken].sort()).toEqual(["BIO 331", "PSY 303"]);
  });
});
