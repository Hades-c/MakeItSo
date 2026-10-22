import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/client";
import type { PlanDraft, PlanItem, PlanProgress, RequirementSlot } from "@/lib/types/plan";
import { REQUIREMENT_SLOTS } from "@/lib/types/plan";
import { seatPressure, slotNote, SEAT_PRESSURE_TEXT } from "@/app/(hub)/plan/_lib/choice";
import { errorMessage, isConflict } from "@/app/(hub)/plan/_lib/errors";
import {
  canRetake,
  earlierCompletion,
  generalWarnings,
  groupByTerm,
  passFailCounts,
  planMapTerms,
  requirementTiles,
  retakeNote,
  retakeTerms,
  warningsFor,
} from "@/app/(hub)/plan/_lib/four-year";
import { creditsText, formatNumber, plural, STATUS_OPTIONS } from "@/app/(hub)/plan/_lib/labels";
import {
  allHandled,
  closingStatus,
  draftTerms,
  orderDrafts,
  PAST_OFFERINGS_NOTE,
  suggestionKey,
} from "@/app/(hub)/plan/_lib/suggestions";
import { parsePlanParams, planHref } from "@/app/(hub)/plan/_lib/tabs";
import { manualEntryBody } from "@/app/(hub)/plan/_components/manual-entry";
import { planTotals } from "@/components/domain/plan-layout";
import { evaluateRequirements } from "@/server/plan/requirements";
import { summerBody } from "@/app/(hub)/plan/_components/summer-editor";

let n = 0;
function item(overrides: Partial<PlanItem> & { courseCode: string }): PlanItem {
  n += 1;
  return {
    id: n.toString(16).padStart(24, "0"),
    termCode: "202601",
    canonicalCode: overrides.courseCode,
    title: overrides.courseCode,
    credits: 1,
    status: "planned",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...overrides,
  };
}

const TERMS = ["202501", "202502", "202503", "202601", "202602", "202603", "202701", "202702"];

describe("4-year plan grouping", () => {
  const items = [
    item({ courseCode: "WRI 101", termCode: "202501", status: "completed" }),
    item({ courseCode: "CHE 115", termCode: "202501", status: "dropped" }),
    item({ courseCode: "MAT 113", termCode: null, source: "ap", status: "completed" }),
    item({ courseCode: "CSC 221", termCode: "202602" }),
    item({ courseCode: "BIO 201", termCode: "202603", status: "planned" }),
    item({ courseCode: "HIS 101", termCode: "203101" }),
  ];
  const groups = groupByTerm(items, TERMS, "202601", "202602");

  it("puts AP/transfer before Davidson, summers only when used, out-of-range terms apart", () => {
    expect(groups.beforeDavidson.map((i) => i.courseCode)).toEqual(["MAT 113"]);
    expect(groups.terms.map((g) => g.termCode)).toEqual([
      "202501",
      "202502",
      "202601",
      "202602",
      "202603",
      "202701",
      "202702",
    ]);
    expect(groups.outside.map((g) => g.termCode)).toEqual(["203101"]);
  });

  it("orders active items first, counts only active credits, marks now/registration", () => {
    const fall25 = groups.terms[0]!;
    expect(fall25.items.map((i) => i.courseCode)).toEqual(["WRI 101", "CHE 115"]);
    expect(fall25.credits).toBe(1);
    expect(groups.terms.find((g) => g.termCode === "202601")!.isCurrent).toBe(true);
    expect(groups.terms.find((g) => g.termCode === "202602")!.isRegistration).toBe(true);
  });

  it("maps statuses onto the degree map; history never fills a slot", () => {
    const map = planMapTerms(groups);
    expect(map[0]).toMatchObject({
      termCode: "202501",
      slots: [{ status: "done", code: "WRI 101", credits: 1 }],
    });
    expect(map.find((t) => t.termCode === "202602")!.slots).toEqual([
      { status: "planned", code: "CSC 221", credits: 1 },
    ]);
    expect(map.find((t) => t.termCode === "202601")!.isCurrent).toBe(true);
    const inProgress = planMapTerms(
      groupByTerm([item({ courseCode: "A 101", status: "registered" })], TERMS, "202601", "202602"),
    );
    expect(inProgress.find((t) => t.termCode === "202601")!.slots[0]!.status).toBe("in-progress");
  });
});

describe("degree map totals", () => {
  it("agree with the plan service's credits: a repeat it counts once is drawn but not counted", () => {
    const items = [
      item({ courseCode: "CSC 221", termCode: "202501", status: "completed" }),
      item({ courseCode: "ECO 232", termCode: "202601", status: "in-progress" }),
      item({ courseCode: "CSC 221", termCode: "202602", status: "planned" }),
      item({ courseCode: "ECO 232", termCode: "202602", status: "planned" }),
      item({ courseCode: "HIS 357", termCode: "202602", status: "planned" }),
    ];
    const progress = evaluateRequirements({
      items,
      manual: { languageExempt: false, pe: { lifetimeActivities: 0, teamSport: false } },
      firstTerm: "202501",
      now: new Date("2026-09-30T16:00:00Z"),
      currentTerm: "202601",
    });
    expect(progress.creditsDone).toBe(1);
    expect(progress.creditsPlanned).toBe(3);
    const groups = groupByTerm(items, TERMS, "202601", "202602");
    const map = planMapTerms(groups, progress.warnings);
    // Every item is still on the map...
    expect(map.flatMap((t) => t.slots)).toHaveLength(5);
    // ...but the totals count each course once, like the service.
    const totals = planTotals(map, 32);
    expect(totals.done).toBe(progress.creditsDone);
    expect(totals.done + totals.inProgress + totals.planned).toBe(progress.creditsPlanned);
    expect(totals).toMatchObject({ done: 1, inProgress: 1, planned: 1 });
    // Without the warnings, the raw count disagrees (the bug).
    const raw = planTotals(planMapTerms(groups), 32);
    expect(raw.done + raw.inProgress + raw.planned).toBe(5);
  });
});

describe("requirement tiles", () => {
  it("one tile per slot, with the student's words for codes and the filling course", () => {
    const wri = item({ courseCode: "WRI 101", termCode: "202501", status: "completed" });
    const ap = item({ courseCode: "MAT 113", termCode: null, source: "ap", status: "completed" });
    const reqs = Object.fromEntries(
      REQUIREMENT_SLOTS.map((s) => [s, "open"]),
    ) as PlanProgress["reqs"];
    reqs.COMP = "done";
    reqs.MQRQ = "done";
    const labels = Object.fromEntries(REQUIREMENT_SLOTS.map((s) => [s, `Name ${s}`])) as Record<
      RequirementSlot,
      string
    >;
    const tiles = requirementTiles(
      { reqs, filledBy: { COMP: [wri.id], MQRQ: [ap.id, "missing"] } },
      [wri, ap],
      labels,
    );
    expect(tiles).toHaveLength(12);
    expect(tiles[0]).toEqual({
      id: "comp",
      code: "Writing",
      label: "Name COMP",
      status: "done",
      course: { code: "WRI 101", termLabel: "Fall 2025" },
    });
    expect(tiles.find((t) => t.id === "mqrq")!.course).toEqual({
      code: "MAT 113",
      termLabel: "before Davidson",
    });
    expect(tiles.find((t) => t.id === "frlg")!.code).toBe("Language");
    expect(tiles.find((t) => t.id === "pe")!.course).toBeUndefined();
  });
});

describe("retakes", () => {
  const done = item({ courseCode: "CSC 121", termCode: "202501", status: "completed" });
  const again = item({ courseCode: "csc 121", canonicalCode: "CSC 121", termCode: "202602" });
  const failed = item({ courseCode: "MAT 135", termCode: "202501", status: "failed" });

  it("notes an earlier completion on a later planned copy", () => {
    const earlier = earlierCompletion(again, [done, again]);
    expect(earlier?.id).toBe(done.id);
    expect(retakeNote(earlier!)).toBe("Already completed in Fall 2025 — plan a retake?");
    expect(retakeNote({ ...done, termCode: null })).toBe(
      "Already counted as AP/transfer credit — plan a retake?",
    );
    expect(earlierCompletion(done, [done, again])).toBeNull();
  });

  it("offers retakes of completed and failed courses, in later free terms from registration on", () => {
    expect(canRetake(done)).toBe(true);
    expect(canRetake(failed)).toBe(true);
    expect(canRetake(again)).toBe(false);
    expect(retakeTerms(done, [done, again], TERMS, "202602")).toEqual([
      "202603",
      "202701",
      "202702",
    ]);
  });
});

describe("warnings and P/F", () => {
  const a = item({ courseCode: "A 101", passFail: true, termCode: "202601" });
  const b = item({ courseCode: "B 101", passFail: true, termCode: "202601" });
  const c = item({ courseCode: "C 101", passFail: true, status: "dropped" });

  it("counts elected P/F among active items", () => {
    const counts = passFailCounts([a, b, c]);
    expect(counts.total).toBe(2);
    expect(counts.byTerm.get("202601")).toBe(2);
  });

  it("splits item warnings from plan-wide ones (deduplicated)", () => {
    const warnings = [
      { code: "pass-fail-term" as const, message: "Two P/F", itemId: a.id },
      { code: "residence-note" as const, message: "Residence" },
      { code: "residence-note" as const, message: "Residence" },
    ];
    expect(warningsFor(warnings, a.id)).toHaveLength(1);
    expect(generalWarnings(warnings).map((w) => w.message)).toEqual(["Residence"]);
  });
});

describe("suggestions", () => {
  const draft: PlanDraft = {
    id: "d".repeat(24),
    kind: "plan-suggestions",
    promptVersion: "v1",
    status: "pending",
    createdAt: "2026-09-30T16:00:00.000Z",
    items: [
      { termCode: "202701", courseCode: "HIS 101", reason: "Fills HTRQ", basis: "past-offerings" },
      { termCode: "202602", courseCode: "CSC 221", reason: "Fills MQRQ", basis: "scheduled" },
      { termCode: "202602", courseCode: "SPA 201", reason: "Language" },
      { termCode: "202602", courseCode: "SPA 201", reason: "duplicate" },
    ],
  };

  it("lists every term in order, ticking off courses in the plan per course", () => {
    const planned = item({ courseCode: "CSC 221", termCode: "202602" });
    const terms = draftTerms(draft, [planned], new Set());
    expect(terms.map((t) => t.termCode)).toEqual(["202602", "202701"]);
    expect(terms[0]!.rows.map((r) => [r.courseCode, r.state])).toEqual([
      ["CSC 221", "in-plan"],
      ["SPA 201", "pending"],
    ]);
    expect(terms[1]!.rows[0]!.basisNote).toBe(PAST_OFFERINGS_NOTE);
    expect(terms[0]!.rows[0]!.basisNote).toBeNull();
  });

  it("a term whose courses are all handled is still listed", () => {
    const rejected = new Set([suggestionKey(draft.id, "202701", "HIS 101")]);
    const terms = draftTerms(draft, [], rejected);
    expect(terms.find((t) => t.termCode === "202701")!.rows[0]!.state).toBe("rejected");
  });

  it("closes as accepted only when every course is in the plan", () => {
    const all = [
      item({ courseCode: "CSC 221", termCode: "202602" }),
      item({ courseCode: "SPA 201", termCode: "202602" }),
      item({ courseCode: "HIS 101", termCode: "202701" }),
    ];
    const inPlan = draftTerms(draft, all, new Set());
    expect(allHandled(inPlan)).toBe(true);
    expect(closingStatus(inPlan)).toBe("accepted");
    const mixed = draftTerms(
      draft,
      all.slice(0, 2),
      new Set([suggestionKey(draft.id, "202701", "HIS 101")]),
    );
    expect(allHandled(mixed)).toBe(true);
    expect(closingStatus(mixed)).toBe("dismissed");
    expect(allHandled(draftTerms(draft, [], new Set()))).toBe(false);
    // Dropped items do not count as "in the plan".
    const dropped = draftTerms(
      draft,
      [item({ courseCode: "CSC 221", termCode: "202602", status: "dropped" })],
      new Set(),
    );
    expect(dropped[0]!.rows[0]!.state).toBe("pending");
  });

  it("orders pending drafts first, newest first", () => {
    const older = { ...draft, id: "a".repeat(24), createdAt: "2026-09-01T00:00:00.000Z" };
    const done = {
      ...draft,
      id: "b".repeat(24),
      status: "dismissed" as const,
      createdAt: "2026-10-01T00:00:00.000Z",
    };
    expect(orderDrafts([older, done, draft]).map((d) => d.id)).toEqual([
      draft.id,
      older.id,
      done.id,
    ]);
  });
});

describe("choice notes", () => {
  it("says what a choice would fill given the plan", () => {
    const choice = { courseCode: "CSC 221", termCode: "202602" };
    expect(slotNote("MQRQ", "open", "Math", undefined, choice)).toEqual({
      slot: "MQRQ",
      text: "Would fill Math",
      tone: "open",
    });
    expect(
      slotNote("MQRQ", "planned", "Math", { courseCode: "CSC 221", termCode: "202602" }, choice)
        .text,
    ).toBe("Fills Math in your plan");
    expect(
      slotNote("COMP", "done", "Writing", { courseCode: "WRI 101", termCode: "202501" }, choice)
        .text,
    ).toBe("Writing already done (WRI 101, Fall 2025)");
    expect(
      slotNote("NSRQ", "this-term", "Science", { courseCode: "BIO 115", termCode: null }, choice)
        .text,
    ).toBe("Science in progress (BIO 115)");
  });

  it("never says 'Would fill' for a slot met without a course (exemption, PE checklist)", () => {
    const choice = { courseCode: "SPA 101", termCode: "202602" };
    expect(slotNote("FRLG", "done", "Foreign Language", undefined, choice)).toEqual({
      slot: "FRLG",
      text: "Foreign Language already met",
      tone: "already",
    });
    expect(slotNote("PE", "planned", "PE", undefined, choice).tone).toBe("already");
    expect(slotNote("PE", "this-term", "PE", undefined, choice).text).toBe("PE in progress");
  });

  it("rates seat pressure", () => {
    const seats = (current: number, max: number, remaining = max - current) => ({
      current,
      max,
      remaining,
      overEnrolled: remaining < 0,
      pressure: max > 0 ? current / max : null,
    });
    expect(seatPressure(null)).toBe("none");
    expect(seatPressure(seats(0, 0))).toBe("none");
    expect(seatPressure(seats(26, 24))).toBe("over");
    expect(seatPressure(seats(24, 24))).toBe("full");
    expect(seatPressure(seats(21, 24))).toBe("high");
    expect(seatPressure(seats(3, 24))).toBe("normal");
    expect(SEAT_PRESSURE_TEXT.full).toMatch(/alternate/);
  });
});

describe("errors, labels and URL state", () => {
  it("turns API errors into one sentence", () => {
    expect(errorMessage(new ApiClientError(401, "unauthorized", "x"), "f")).toMatch(
      /session has ended/,
    );
    expect(
      errorMessage(
        new ApiClientError(400, "validation_failed", "Some WebTree choices are invalid.", [
          { path: "choices.0.crn", message: "CRN 1 is not a Spring 2027 section." },
        ]),
        "f",
      ),
    ).toBe("Some WebTree choices are invalid. CRN 1 is not a Spring 2027 section.");
    expect(errorMessage(new ApiClientError(500, "internal", "boom"), "fallback")).toBe("fallback");
    expect(errorMessage(new Error("x"), "fallback")).toBe("fallback");
    expect(isConflict(new ApiClientError(409, "conflict", "dup"))).toBe(true);
    expect(isConflict(new Error("x"))).toBe(false);
  });

  it("words credits and counts", () => {
    expect(creditsText(1)).toBe("1 credit");
    expect(creditsText(0.5)).toBe("0.5 credits");
    expect(formatNumber(1.333)).toBe("1.33");
    expect(plural(2, "course")).toBe("2 courses");
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "planned",
      "registered",
      "in-progress",
      "completed",
      "failed",
      "dropped",
      "withdrawn",
    ]);
  });

  it("reads and builds the /plan URL", () => {
    expect(parsePlanParams({})).toEqual({ tab: "next", term: null, print: false });
    expect(parsePlanParams({ tab: "four-year", view: "print" }).print).toBe(false);
    expect(parsePlanParams({ tab: "next", view: "print", term: "202701" })).toEqual({
      tab: "next",
      term: "202701",
      print: true,
    });
    expect(parsePlanParams({ tab: "nope", term: "000001" })).toEqual({
      tab: "next",
      term: null,
      print: false,
    });
    expect(planHref("summer")).toBe("/plan?tab=summer");
    expect(planHref("next", { print: true })).toBe("/plan?tab=next&view=print");
  });
});

describe("form bodies", () => {
  const base = {
    kind: "ap" as const,
    courseCode: "mat113",
    title: " Calculus ",
    credits: "",
    termCode: "",
    status: "completed" as const,
  };

  it("builds a manual entry (credits default 1, never 4; AP may have no term)", () => {
    expect(manualEntryBody(base)).toEqual({
      ok: true,
      body: {
        termCode: null,
        courseCode: "MAT 113",
        source: "ap",
        status: "completed",
        manualTitle: "Calculus",
        manualCredits: 1,
      },
    });
  });

  it("explains a bad manual entry", () => {
    expect(manualEntryBody({ ...base, courseCode: "calculus" })).toMatchObject({
      ok: false,
      field: "courseCode",
    });
    expect(manualEntryBody({ ...base, title: " " })).toMatchObject({ ok: false, field: "title" });
    expect(manualEntryBody({ ...base, credits: "5" })).toMatchObject({
      ok: false,
      field: "credits",
    });
    expect(manualEntryBody({ ...base, kind: "manual" })).toMatchObject({
      ok: false,
      field: "termCode",
    });
  });

  it("builds a summer activity and rejects a non-summer term", () => {
    const draft = {
      termCode: "202603",
      title: " Lab ",
      kind: "research" as const,
      organization: "",
      note: "",
    };
    expect(summerBody(draft)).toEqual({
      ok: true,
      body: { termCode: "202603", title: "Lab", kind: "research" },
    });
    expect(summerBody({ ...draft, title: "" })).toMatchObject({ ok: false, field: "title" });
    expect(summerBody({ ...draft, termCode: "" })).toMatchObject({ ok: false, field: "termCode" });
    expect(summerBody({ ...draft, termCode: "202602" })).toMatchObject({
      ok: false,
      field: "termCode",
    });
  });
});
