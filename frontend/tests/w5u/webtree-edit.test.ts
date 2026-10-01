import { describe, expect, it } from "vitest";
import type { WebTreeList } from "@/lib/types/plan";
import {
  addAlternate,
  addChoice,
  findCrn,
  listedCrns,
  MAX_ALTERNATES,
  MAX_CHOICES,
  moveChoice,
  normalizeRanks,
  promoteAlternate,
  removeAlternate,
  removeChoice,
  sameList,
  type EditResult,
} from "@/app/(hub)/plan/_lib/webtree-edit";

const LIST: WebTreeList = {
  termCode: "202602",
  choices: [
    { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
    { rank: 2, crn: "20478", courseCode: "SPA 201", alternates: [] },
    { rank: 3, crn: "20001", courseCode: "HIS 101", alternates: [] },
  ],
};

function ok(result: EditResult): WebTreeList {
  if (!result.ok) throw new Error(result.reason);
  return result.list;
}

const order = (list: WebTreeList) => list.choices.map((c) => `${c.rank}:${c.crn}`);

describe("WebTree list edits", () => {
  it("normalises ranks to 1..n in rank order", () => {
    const list = normalizeRanks([
      { rank: 7, crn: "1", courseCode: "A 101", alternates: [] },
      { rank: 3, crn: "2", courseCode: "B 101", alternates: [] },
    ]);
    expect(list.map((c) => [c.rank, c.crn])).toEqual([
      [1, "2"],
      [2, "1"],
    ]);
  });

  it("moves a choice up and down, keeping ranks consecutive", () => {
    expect(order(ok(moveChoice(LIST, 2, "up")))).toEqual(["1:20478", "2:20135", "3:20001"]);
    expect(order(ok(moveChoice(LIST, 2, "down")))).toEqual(["1:20135", "2:20001", "3:20478"]);
    // Alternates travel with their choice.
    expect(ok(moveChoice(LIST, 1, "down")).choices[1]!.alternates).toEqual(["20136"]);
  });

  it("refuses to move past the ends or a missing rank, leaving the list alone", () => {
    expect(moveChoice(LIST, 1, "up")).toEqual({
      ok: false,
      reason: "That choice is already first.",
    });
    expect(moveChoice(LIST, 3, "down")).toEqual({
      ok: false,
      reason: "That choice is already last.",
    });
    expect(moveChoice(LIST, 9, "up").ok).toBe(false);
  });

  it("adds a choice at the end and never lists a CRN twice", () => {
    const added = ok(addChoice(LIST, { crn: "20500", courseCode: "ECO 101" }));
    expect(order(added).at(-1)).toBe("4:20500");
    expect(addChoice(LIST, { crn: "20478", courseCode: "SPA 201" })).toEqual({
      ok: false,
      reason: "CRN 20478 is already your choice 2.",
    });
    expect(addChoice(LIST, { crn: "20136", courseCode: "CSC 221" })).toEqual({
      ok: false,
      reason: "CRN 20136 is already an alternate for choice 1.",
    });
  });

  it("caps the list at MAX_CHOICES and alternates at MAX_ALTERNATES", () => {
    const full: WebTreeList = {
      termCode: "202602",
      choices: Array.from({ length: MAX_CHOICES }, (_, i) => ({
        rank: i + 1,
        crn: String(30000 + i),
        courseCode: "MUS 101",
        alternates: [],
      })),
    };
    expect(addChoice(full, { crn: "39999", courseCode: "MUS 101" }).ok).toBe(false);
    const many: WebTreeList = {
      termCode: "202602",
      choices: [
        {
          rank: 1,
          crn: "40000",
          courseCode: "WRI 101",
          alternates: Array.from({ length: MAX_ALTERNATES }, (_, i) => String(40001 + i)),
        },
      ],
    };
    expect(addAlternate(many, 1, "49999")).toEqual({
      ok: false,
      reason: `A choice holds at most ${MAX_ALTERNATES} alternates.`,
    });
  });

  it("removes a choice (with its alternates) and renumbers", () => {
    const list = ok(removeChoice(LIST, 1));
    expect(order(list)).toEqual(["1:20478", "2:20001"]);
    expect(listedCrns(list).has("20136")).toBe(false);
    expect(removeChoice(LIST, 8).ok).toBe(false);
  });

  it("adds and removes alternates", () => {
    const list = ok(addAlternate(LIST, 2, "20479"));
    expect(list.choices[1]!.alternates).toEqual(["20479"]);
    expect(ok(removeAlternate(list, 2, "20479")).choices[1]!.alternates).toEqual([]);
    expect(removeAlternate(LIST, 2, "20479").ok).toBe(false);
    expect(addAlternate(LIST, 9, "20479").ok).toBe(false);
  });

  it("promotes an alternate: the old choice takes its place among the alternates", () => {
    const list = ok(promoteAlternate(LIST, 1, "20136", "CSC 221"));
    expect(list.choices[0]).toEqual({
      rank: 1,
      crn: "20136",
      courseCode: "CSC 221",
      alternates: ["20135"],
    });
    expect(promoteAlternate(LIST, 2, "20136", "CSC 221").ok).toBe(false);
  });

  it("never mutates its input", () => {
    const before = JSON.stringify(LIST);
    moveChoice(LIST, 2, "up");
    addAlternate(LIST, 2, "1");
    promoteAlternate(LIST, 1, "20136", "CSC 221");
    removeChoice(LIST, 1);
    expect(JSON.stringify(LIST)).toBe(before);
  });

  it("finds a CRN and compares lists", () => {
    expect(findCrn(LIST, "20478")).toEqual({ role: "choice", rank: 2 });
    expect(findCrn(LIST, "20136")).toEqual({ role: "alternate", rank: 1 });
    expect(findCrn(LIST, "1")).toBeNull();
    expect(sameList(LIST, ok(moveChoice(ok(moveChoice(LIST, 2, "up")), 1, "down")))).toBe(true);
    expect(sameList(LIST, ok(moveChoice(LIST, 2, "up")))).toBe(false);
    expect(sameList(LIST, { ...LIST, termCode: "202701" })).toBe(false);
  });
});
