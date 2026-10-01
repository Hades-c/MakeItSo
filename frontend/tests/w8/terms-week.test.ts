import { describe, expect, it } from "vitest";
import {
  addStatus,
  addToPlanTerms,
  defaultAddTerm,
  planWindowTerms,
  unpublishedNote,
} from "@/app/(hub)/courses/_lib/terms";
import { hoursFor, weekView } from "@/app/(hub)/courses/_lib/week";
import type { Availability } from "@/lib/types/catalog";
import { detectConflicts } from "@/server/plan";
import { section, withSection } from "./helpers";

/** Add-to-plan terms (PLAN §3, §5 "Availability") and the course page week grid. */

const WINDOW = { current: "202601", registration: "202602" };
const HISTORY: Availability[] = [
  { termCode: "202501", status: "offered", sectionCount: 1 },
  { termCode: "202601", status: "offered", sectionCount: 2 },
  { termCode: "202602", status: "not-offered" },
  {
    termCode: "202701",
    status: "not-yet-published",
    usually: { season: "Fall", basedOn: ["202501", "202601"] },
  },
];

describe("add-to-plan terms", () => {
  it("offers the current, registration and next term", () => {
    expect(planWindowTerms(WINDOW)).toEqual(["202601", "202602", "202701"]);
    expect(planWindowTerms({ current: "202602", registration: "202602" })).toEqual([
      "202602",
      "202701",
    ]);
  });

  it("maps availability, never 'offered' for an unpublished term", () => {
    expect(addToPlanTerms(HISTORY, WINDOW)).toEqual([
      { code: "202601", label: "Fall 2026", availability: "offered", sectionCount: 2 },
      { code: "202602", label: "Spring 2027", availability: "not-offered" },
      {
        code: "202701",
        label: "Fall 2027",
        availability: "not-yet-published",
        note: "Usually Fall",
      },
    ]);
  });

  it("leaves out a term the history does not report", () => {
    expect(addToPlanTerms(HISTORY.slice(0, 2), WINDOW).map((t) => t.code)).toEqual(["202601"]);
  });

  it("starts on the preferred term, else registration, else next, never a not-offered term", () => {
    const terms = addToPlanTerms(HISTORY, WINDOW);
    expect(defaultAddTerm(terms, WINDOW, "202601")).toBe("202601");
    expect(defaultAddTerm(terms, WINDOW, "202602")).toBe("202701");
    expect(defaultAddTerm(terms, WINDOW)).toBe("202701");
    const offered = addToPlanTerms(
      [...HISTORY.slice(0, 2), { termCode: "202602", status: "offered", sectionCount: 1 }],
      WINDOW,
    );
    expect(defaultAddTerm(offered, WINDOW)).toBe("202602");
    expect(defaultAddTerm([], WINDOW)).toBeNull();
  });

  it("explains the unpublished term in a full sentence", () => {
    expect(unpublishedNote(HISTORY, WINDOW)).toBe(
      "Fall 2027 isn’t published yet. Usually offered in Fall (based on Fall 2025 and Fall 2026).",
    );
    expect(unpublishedNote(HISTORY.slice(0, 3), WINDOW)).toBeNull();
  });

  it("records the current term as in-progress and later terms as planned", () => {
    expect(addStatus("202601", "202601")).toBe("in-progress");
    expect(addStatus("202602", "202601")).toBe("planned");
  });
});

describe("weekView", () => {
  const csc = section("202602", "CSC 221", "A"); // MWF 10:30–11:20
  const bio = section("202602", "BIO 201", "A"); // overlaps MWF 10:30
  const art = section("202602", "ART 101", "A"); // TR 12:15–13:30

  it("draws the chosen section dashed when it is not in the plan, and marks conflicts", () => {
    const conflicts = detectConflicts([art, bio, csc]);
    const view = weekView({ planned: [art, bio], chosen: csc, conflicts });
    expect(view.chosenTentative).toBe(true);
    const cscBlocks = view.blocks.filter((b) => b.code === "CSC 221 A");
    expect(cscBlocks.map((b) => b.day)).toEqual(["M", "W", "F"]);
    expect(cscBlocks.every((b) => b.tentative && b.conflict)).toBe(true);
    expect(view.blocks.filter((b) => b.code === "ART 101 A").every((b) => !b.conflict)).toBe(true);
    expect(view.blocks.filter((b) => b.code.startsWith("BIO 201")).some((b) => b.conflict)).toBe(
      true,
    );
    expect(view.chosenConflicts.length).toBeGreaterThan(0);
  });

  it("marks only the meetings that overlap, not every meeting on a conflicting day", () => {
    // BIO 201 A: lecture MWF 10:30–11:20 plus a second meeting M 13:30–16:20.
    const other = withSection(csc, {
      crn: "29990",
      meetings: [{ days: ["M"], start: "14:00", end: "15:00", kind: "class", tba: false }],
    });
    const view = weekView({
      planned: [other],
      chosen: bio,
      conflicts: detectConflicts([other, bio]),
    });
    const marked = view.blocks
      .filter((b) => b.conflict)
      .map((b) => `${b.code} ${b.day} ${b.start}`);
    expect(marked.sort()).toEqual(["BIO 201 A M 13:30", "CSC 221 A M 14:00"]);
    expect(view.chosenConflicts).toHaveLength(1);
  });

  it("draws a planned chosen section solid", () => {
    const view = weekView({ planned: [csc], chosen: csc, conflicts: [] });
    expect(view.chosenTentative).toBe(false);
    expect(view.blocks).toHaveLength(3);
    expect(view.blocks.every((b) => !b.tentative)).toBe(true);
  });

  it("lists a TBA section instead of placing it", () => {
    const tba = withSection(csc, {
      crn: "29998",
      meetings: [{ days: [], start: null, end: null, kind: "class", tba: true }],
    });
    const view = weekView({ planned: [], chosen: tba, conflicts: [] });
    expect(view.blocks).toEqual([expect.objectContaining({ tba: true, code: "CSC 221 A" })]);
    const none = withSection(csc, { crn: "29997", meetings: [] });
    expect(weekView({ planned: [none], chosen: null, conflicts: [] }).blocks[0]?.tba).toBe(true);
  });

  it("fits the hours to the classes (at least 9a–4p, within 7a–10p)", () => {
    expect(hoursFor([])).toEqual({ startHour: 9, endHour: 16 });
    expect(hoursFor([{ id: "a", code: "X 100", day: "M", start: "08:05", end: "09:20" }])).toEqual({
      startHour: 8,
      endHour: 16,
    });
    expect(hoursFor([{ id: "a", code: "X 100", day: "T", start: "19:00", end: "21:30" }])).toEqual({
      startHour: 9,
      endHour: 22,
    });
  });
});
