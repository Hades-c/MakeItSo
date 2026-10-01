import { describe, expect, it } from "vitest";
import {
  aboutPatch,
  aboutProblem,
  academicYearEndAt,
  cleanPrograms,
  defaultFirstTerm,
  firstTermAfterYearChange,
  firstTermFits,
  firstTermOptions,
  firstYearClass,
  graduationYearOptions,
  UNDECIDED,
} from "@/app/onboarding/_lib/academics";
import { ApiClientError } from "@/lib/api/client";
import { describeFailure, issueFor } from "@/app/onboarding/_lib/errors";
import {
  autoSection,
  classAction,
  classAddBody,
  completedAddBody,
  completedItems,
  completedTermOptions,
  currentClassStatus,
  findActiveItem,
  instructorLabel,
  manualAddBody,
  ManualEntrySchema,
  meetingLabel,
  startsAfter,
  termItems,
} from "@/app/onboarding/_lib/plan-items";
import {
  nextStep,
  ONBOARDING_STEPS,
  parseStep,
  prevStep,
  resumeStep,
  stepHref,
  stepLabel,
  stepProgress,
} from "@/app/onboarding/_lib/steps";
import type { Meeting, Section } from "@/lib/types/catalog";
import type { PlanItem } from "@/lib/types/plan";

/** Unit tests for every onboarding rule (W9b-2, PLAN §3 /onboarding): steps, step 1, steps 2–3, errors. */

const NOW = "2026-09-30T16:00:00.000Z";

let nextId = 0;
function item(patch: Partial<PlanItem> = {}): PlanItem {
  const code = patch.courseCode ?? "CSC 121";
  return {
    id: (++nextId).toString(16).padStart(24, "0"),
    termCode: "202601",
    courseCode: code,
    canonicalCode: patch.canonicalCode ?? code,
    title: "Programming & Problem Solving",
    credits: 1,
    status: "in-progress",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...patch,
  };
}

function meeting(patch: Partial<Meeting> = {}): Meeting {
  return {
    days: ["M", "W", "F"],
    start: "09:30",
    end: "10:20",
    kind: "class",
    tba: false,
    ...patch,
  };
}

describe("steps", () => {
  it("has the four steps of PLAN §3 in order", () => {
    expect(ONBOARDING_STEPS).toEqual(["about", "classes", "completed", "interests"]);
    expect(ONBOARDING_STEPS.map((step) => stepLabel(step, "Fall 2026"))).toEqual([
      "About you",
      "Your Fall 2026 classes",
      "Courses you have taken",
      "Interests",
    ]);
  });

  it("keeps the step in the URL", () => {
    expect(stepHref("classes")).toBe("/onboarding?step=classes");
    expect(parseStep("completed")).toBe("completed");
    expect(parseStep(["interests", "about"])).toBe("interests");
    expect(parseStep("nope")).toBeNull();
    expect(parseStep(undefined)).toBeNull();
    expect(parseStep("")).toBeNull();
  });

  it("moves forward and back, stopping at the ends", () => {
    expect(nextStep("about")).toBe("classes");
    expect(nextStep("interests")).toBeNull();
    expect(prevStep("classes")).toBe("about");
    expect(prevStep("about")).toBeNull();
  });

  it("knows what each step already saved", () => {
    const empty = {
      firstTerm: null,
      majors: [],
      minors: [],
      currentTermItems: 0,
      completedItems: 0,
      interests: [],
    };
    expect(stepProgress(empty)).toEqual({
      about: false,
      classes: false,
      completed: false,
      interests: false,
    });
    expect(stepProgress({ ...empty, firstTerm: "202501" }).about).toBe(true);
    expect(stepProgress({ ...empty, majors: ["Major in History (A.B. Degree)"] }).about).toBe(true);
    expect(stepProgress({ ...empty, currentTermItems: 2 }).classes).toBe(true);
    expect(stepProgress({ ...empty, completedItems: 1 }).completed).toBe(true);
    expect(stepProgress({ ...empty, interests: ["law"] }).interests).toBe(true);
  });

  it("resumes after the furthest saved step, never forcing skipped steps again", () => {
    const none = { about: false, classes: false, completed: false, interests: false };
    expect(resumeStep(none, false)).toBe("about");
    expect(resumeStep({ ...none, about: true }, false)).toBe("classes");
    // Skipped step 2, saved step 3 → step 4.
    expect(resumeStep({ ...none, about: true, completed: true }, false)).toBe("interests");
    // A legacy plan with current classes but nothing else → step 3.
    expect(resumeStep({ ...none, classes: true }, false)).toBe("completed");
    expect(
      resumeStep({ about: true, classes: true, completed: true, interests: true }, false),
    ).toBe("interests");
  });

  it("starts a re-run from the beginning once onboarded", () => {
    expect(resumeStep({ about: true, classes: true, completed: true, interests: true }, true)).toBe(
      "about",
    );
  });
});

describe("step 1: about you", () => {
  it("defaults the first term to Fall of graduationYear − 4", () => {
    expect(defaultFirstTerm(2030)).toBe("202601");
    expect(defaultFirstTerm(2029)).toBe("202501");
  });

  it("knows the academic year and the first-year class (June 1 rollover, ET)", () => {
    expect(academicYearEndAt(NOW)).toBe(2027);
    expect(academicYearEndAt("2027-05-31T12:00:00-04:00")).toBe(2027);
    expect(academicYearEndAt("2027-06-01T12:00:00-04:00")).toBe(2028);
    expect(firstYearClass(NOW)).toBe(2030);
  });

  it("offers last spring's class through next fall's, plus a stored year outside that", () => {
    expect(graduationYearOptions(NOW)).toEqual([2026, 2027, 2028, 2029, 2030, 2031]);
    expect(graduationYearOptions(NOW, 2024)).toEqual([2024, 2026, 2027, 2028, 2029, 2030, 2031]);
    expect(graduationYearOptions(NOW, 2029)).toHaveLength(6);
  });

  it("applies the server's first-term rule", () => {
    expect(firstTermFits("202601", 2030)).toBe(true);
    expect(firstTermFits("202902", 2030)).toBe(true);
    expect(firstTermFits("203001", 2030)).toBe(false);
    expect(firstTermFits("202201", 2030)).toBe(true);
    expect(firstTermFits("202101", 2030)).toBe(false);
    expect(firstTermFits("202603", 2030)).toBe(false);
  });

  it("lists regular first terms from six years before graduation, plus an earlier stored one", () => {
    const codes = firstTermOptions(2030).map((term) => term.code);
    expect(codes[0]).toBe("202401");
    expect(codes.at(-1)).toBe("202902");
    expect(codes.every((code) => !code.endsWith("03"))).toBe(true);
    expect(firstTermOptions(2030)[0]).toEqual({ code: "202401", label: "Fall 2024" });
    expect(firstTermOptions(2030, "202302").map((term) => term.code)[0]).toBe("202302");
    expect(firstTermOptions(2030, "201901").map((term) => term.code)[0]).toBe("202401");
  });

  it("follows the graduation year until the student picks a first term", () => {
    expect(firstTermAfterYearChange("202601", 2029, false)).toBe("202501");
    expect(firstTermAfterYearChange("202602", 2029, true)).toBe("202602");
    // A picked term that no longer fits falls back to the default.
    expect(firstTermAfterYearChange("202602", 2026, true)).toBe("202201");
  });

  it("saves Undecided as no major, and drops blanks and repeats", () => {
    expect(cleanPrograms([UNDECIDED])).toEqual([]);
    expect(
      cleanPrograms(["", " Major in History (A.B. Degree) ", "Major in History (A.B. Degree)"]),
    ).toEqual(["Major in History (A.B. Degree)"]);
    expect(cleanPrograms(["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
    expect(
      aboutPatch({
        graduationYear: 2029,
        firstTerm: "202501",
        majors: [UNDECIDED],
        minors: ["", "Minor in Music"],
      }),
    ).toEqual({
      graduationYear: 2029,
      firstTerm: "202501",
      majors: [],
      minors: ["Minor in Music"],
    });
  });

  it("names a first term that does not fit before saving", () => {
    expect(
      aboutProblem({ graduationYear: 2029, firstTerm: "202501", majors: [], minors: [] }),
    ).toBeNull();
    expect(
      aboutProblem({ graduationYear: 2029, firstTerm: "202901", majors: [], minors: [] }),
    ).toEqual({
      field: "firstTerm",
      message: "The first term and the graduation year do not fit together.",
    });
  });
});

describe("steps 2 and 3: plan items without duplicates", () => {
  it("finds an active item by term and canonical code (cross-listed siblings are one course)", () => {
    const bio = item({ courseCode: "PSY 303", canonicalCode: "BIO 331" });
    const items = [bio, item({ courseCode: "HIS 357", status: "dropped" })];
    expect(findActiveItem(items, "202601", "BIO 331", ["PSY 303"])).toBe(bio);
    expect(findActiveItem(items, "202601", "PSY 303", [{ courseCode: "BIO 331" }])).toBe(bio);
    expect(findActiveItem(items, "202602", "BIO 331", ["PSY 303"])).toBeUndefined();
    // dropped/failed/withdrawn never block a re-add.
    expect(findActiveItem(items, "202601", "HIS 357")).toBeUndefined();
    expect(
      findActiveItem([item({ termCode: null, courseCode: "MAT 113" })], null, "MAT 113"),
    ).toBeDefined();
  });

  it("adds, sets the CRN of the item already there, or does nothing on a re-run", () => {
    const withoutCrn = item({ courseCode: "CSC 121" });
    const withCrn = item({ courseCode: "HIS 357", crn: "10274" });
    const items = [withoutCrn, withCrn];
    expect(classAction(items, "202601", "ENG 260", [], "10300")).toEqual({ kind: "add" });
    expect(classAction(items, "202601", "CSC 121", [], "10142")).toEqual({
      kind: "set-crn",
      itemId: withoutCrn.id,
    });
    expect(classAction(items, "202601", "HIS 357", [], "10274")).toEqual({
      kind: "none",
      itemId: withCrn.id,
    });
    expect(classAction(items, "202601", "HIS 357", [], "10275")).toEqual({
      kind: "set-crn",
      itemId: withCrn.id,
    });
  });

  it("gives current classes in-progress once the term has started (ET), registered before", () => {
    expect(currentClassStatus({ startDate: "2026-08-26" }, NOW)).toBe("in-progress");
    // 23:30 ET the evening before (03:30 UTC on the first day): not started yet.
    expect(currentClassStatus({ startDate: "2026-09-30" }, "2026-09-30T03:30:00Z")).toBe(
      "registered",
    );
    // 00:30 ET on the first day: started.
    expect(currentClassStatus({ startDate: "2026-09-30" }, "2026-09-30T04:30:00Z")).toBe(
      "in-progress",
    );
    expect(currentClassStatus({ startDate: "2026-10-01" }, NOW)).toBe("registered");
    expect(currentClassStatus(undefined, NOW)).toBe("in-progress");
  });

  it("knows incoming students and the terms a completed course can come from", () => {
    expect(startsAfter("202701", "202601")).toBe(true);
    expect(startsAfter("202601", "202601")).toBe(false);
    expect(completedTermOptions("202601", "202601")).toEqual([]);
    expect(completedTermOptions("202501", "202601")).toEqual(["202502", "202501"]);
    expect(completedTermOptions("202402", "202601")).toEqual(["202502", "202501", "202402"]);
    expect(completedTermOptions("202602", "202601")).toEqual([]);
  });

  it("auto-selects the only section", () => {
    const section = { crn: "10274" } as Section;
    expect(autoSection({ sections: [section] })).toBe(section);
    expect(autoSection({ sections: [section, { crn: "10275" } as Section] })).toBeNull();
    expect(autoSection({ sections: [] })).toBeNull();
  });

  it("labels meetings and instructors as the catalog states them", () => {
    expect(meetingLabel(meeting({ building: "Chambers", room: "1012" }))).toBe(
      "MWF 9:30a–10:20a · Chambers 1012",
    );
    expect(
      meetingLabel(meeting({ days: ["R", "T"], start: "13:40", end: "16:30", kind: "lab" })),
    ).toBe("Lab · TR 1:40p–4:30p");
    expect(meetingLabel(meeting({ days: [], start: null, end: null, tba: true }))).toBe("Time TBA");
    expect(meetingLabel(meeting({ start: null }))).toBe("Time TBA");
    expect(
      instructorLabel([
        { first: "Katy", last: "Williams", isStaff: false },
        { first: "", last: "Staff", isStaff: true },
      ]),
    ).toBe("Katy Williams, Staff (TBA)");
    expect(instructorLabel([])).toBe("Staff (TBA)");
  });

  it("builds the plan API bodies", () => {
    expect(classAddBody("202601", "CSC 121", "10142", "in-progress")).toEqual({
      termCode: "202601",
      courseCode: "CSC 121",
      crn: "10142",
      status: "in-progress",
      source: "catalog",
    });
    expect(completedAddBody("202502", "WRI 101")).toEqual({
      termCode: "202502",
      courseCode: "WRI 101",
      status: "completed",
      source: "catalog",
    });
  });

  it("validates quick-add entries: AP/transfer without a term, a Davidson course with one", () => {
    const ap = ManualEntrySchema.parse({
      kind: "ap",
      courseCode: "mat113",
      credits: 1,
      termCode: null,
    });
    expect(ap.courseCode).toBe("MAT 113");
    expect(manualAddBody(ap)).toEqual({
      termCode: null,
      courseCode: "MAT 113",
      status: "completed",
      source: "ap",
      manualCredits: 1,
    });
    const transfer = ManualEntrySchema.parse({
      kind: "transfer",
      courseCode: "ECO 101",
      title: " Principles of Economics ",
      credits: 0.5,
      termCode: "202503",
    });
    expect(manualAddBody(transfer)).toMatchObject({
      termCode: "202503",
      source: "transfer",
      manualTitle: "Principles of Economics",
      manualCredits: 0.5,
    });
    const noTerm = ManualEntrySchema.safeParse({
      kind: "manual",
      courseCode: "CSC 121",
      credits: 1,
      termCode: null,
    });
    expect(noTerm.success).toBe(false);
    expect(noTerm.error?.issues[0]?.path).toEqual(["termCode"]);
    expect(
      ManualEntrySchema.safeParse({
        kind: "ap",
        courseCode: "calculus",
        credits: 1,
        termCode: null,
      }).success,
    ).toBe(false);
    expect(
      ManualEntrySchema.safeParse({ kind: "ap", courseCode: "MAT 113", credits: 5, termCode: null })
        .success,
    ).toBe(false);
    expect(
      ManualEntrySchema.safeParse({
        kind: "ap",
        courseCode: "MAT 113",
        credits: Number.NaN,
        termCode: null,
      }).success,
    ).toBe(false);
  });

  it("lists completed items (AP/transfer first, newest term first) and a term's active items", () => {
    const ap = item({ termCode: null, courseCode: "MAT 113", status: "completed", source: "ap" });
    const older = item({ termCode: "202501", courseCode: "WRI 101", status: "completed" });
    const newer = item({ termCode: "202502", courseCode: "HIS 101", status: "completed" });
    const current = item({ courseCode: "CSC 121" });
    const dropped = item({ courseCode: "ENG 260", status: "dropped" });
    const all = [older, current, newer, ap, dropped];
    expect(completedItems(all)).toEqual([ap, newer, older]);
    expect(termItems(all, "202601")).toEqual([current]);
  });
});

describe("errors", () => {
  it("shows students' messages for known codes and fixed wording otherwise", () => {
    expect(describeFailure(new Error("boom")).message).toMatch(/Could not reach MakeItSo/);
    expect(describeFailure(new ApiClientError(401, "unauthorized", "x"))).toMatchObject({
      signedOut: true,
      message: "Your session has ended. Sign in again to continue.",
    });
    expect(
      describeFailure(new ApiClientError(409, "conflict", "CSC 121 is already in your plan.")),
    ).toMatchObject({ conflict: true, message: "CSC 121 is already in your plan." });
    expect(describeFailure(new ApiClientError(500, "internal", "stack trace")).message).toBe(
      "Something went wrong. Please try again.",
    );
    const invalid = describeFailure(
      new ApiClientError(400, "validation_failed", "Some fields are invalid.", [
        { path: "majors.1", message: "Pick a name from the list of programs." },
      ]),
    );
    expect(invalid.message).toBe("Pick a name from the list of programs.");
    expect(issueFor(invalid.issues, "majors")).toBe("Pick a name from the list of programs.");
    expect(issueFor(invalid.issues, "minors")).toBeUndefined();
  });
});
