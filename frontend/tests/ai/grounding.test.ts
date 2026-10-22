import { describe, expect, it } from "vitest";
import { MAX_DROPPED_SHARE } from "@/server/ai/config";
import { groundPicks, stillOffered, type GroundingCandidate } from "@/server/ai/grounding";

/** Grounding of suggested courses (PLAN §5): candidates only, allowed terms, not taken, > 30% dropped = invalid. */

const candidate = (
  courseCode: string,
  terms: Record<string, "scheduled" | "past-offerings"> = { "202602": "scheduled" },
  siblings: string[] = [],
): GroundingCandidate => ({
  courseCode,
  canonical: [courseCode, ...siblings].sort()[0]!,
  siblings,
  terms: new Map(Object.entries(terms)),
});

const CANDIDATES = [
  candidate("ECO 101"),
  candidate("SOC 101"),
  candidate("BIO 331", { "202602": "scheduled" }, ["PSY 303"]),
  candidate("MUS 101", { "202701": "past-offerings" }),
  candidate("ART 111"),
];

const options = { taken: new Set<string>(), maxItems: 5, fallbackReason: () => "Fallback reason." };
const pick = (courseCode: string, termCode = "202602", why = "Counts toward SSRQ.") => ({
  courseCode,
  termCode,
  why,
});

describe("groundPicks", () => {
  it("keeps candidates in their terms, normalising codes and labelling the basis", () => {
    const result = groundPicks([pick("eco101"), pick("MUS 101", "202701")], CANDIDATES, options);
    expect(result).toMatchObject({ invalid: false, droppedShare: 0, dropped: [] });
    expect(result.items).toEqual([
      {
        courseCode: "ECO 101",
        termCode: "202602",
        reason: "Counts toward SSRQ.",
        basis: "scheduled",
      },
      {
        courseCode: "MUS 101",
        termCode: "202701",
        reason: "Counts toward SSRQ.",
        basis: "past-offerings",
      },
    ]);
  });

  it("drops invented codes, other terms, junk, repeats and cross-listed repeats", () => {
    const result = groundPicks(
      [
        pick("ECO 101"),
        pick("FAK 999"),
        pick("ECO 101"),
        pick("MUS 101", "202602"),
        pick("not a code"),
        pick("BIO 331"),
        pick("PSY 303"),
      ],
      CANDIDATES,
      options,
    );
    expect(result.items.map((i) => i.courseCode)).toEqual(["ECO 101", "BIO 331"]);
    expect(result.dropped.map((d) => d.problem)).toEqual([
      "not-a-candidate",
      "duplicate",
      "wrong-term",
      "not-a-course-code",
      "duplicate",
    ]);
    expect(result.droppedShare).toBeCloseTo(5 / 7);
    expect(result.invalid).toBe(true);
  });

  it("drops courses already completed or planned, siblings included", () => {
    const result = groundPicks([pick("PSY 303"), pick("ECO 101")], CANDIDATES, {
      ...options,
      taken: new Set(["BIO 331"]),
    });
    expect(result.items.map((i) => i.courseCode)).toEqual(["ECO 101"]);
    expect(result.dropped).toEqual([
      { courseCode: "PSY 303", termCode: "202602", problem: "already-in-plan" },
    ]);
  });

  it("is invalid above 30% dropped, valid at 30% or less", () => {
    expect(MAX_DROPPED_SHARE).toBe(0.3);
    const tenPicks = (bad: number) => [
      ...["ECO 101", "SOC 101", "BIO 331", "ART 111"].map((c) => pick(c)),
      ...Array.from({ length: bad }, (_, i) => pick(`FAK ${100 + i}`)),
    ];
    expect(groundPicks(tenPicks(1), CANDIDATES, options).invalid).toBe(false); // 1/5 = 20%
    const atThirty = groundPicks(
      [
        ...tenPicks(0),
        pick("MUS 101", "202701"),
        ...Array.from({ length: 3 }, (_, i) => pick(`FAK ${i}`)),
      ],
      [...CANDIDATES, candidate("CHE 101"), candidate("PHY 101")],
      { ...options, maxItems: 10 },
    );
    expect(atThirty.droppedShare).toBeCloseTo(3 / 8);
    expect(atThirty.invalid).toBe(true);
    const exactlyThirty = groundPicks(
      [
        ...["ECO 101", "SOC 101", "BIO 331", "ART 111", "CHE 101", "PHY 101"].map((c) => pick(c)),
        pick("MUS 101", "202701"),
        ...Array.from({ length: 3 }, (_, i) => pick(`FAK ${i}`)),
      ],
      [...CANDIDATES, candidate("CHE 101"), candidate("PHY 101")],
      { ...options, maxItems: 10 },
    );
    expect(exactlyThirty.droppedShare).toBeCloseTo(0.3);
    expect(exactlyThirty.invalid).toBe(false);
  });

  it("is invalid when nothing usable is returned", () => {
    expect(groundPicks([], CANDIDATES, options).invalid).toBe(true);
  });

  it("caps the kept items without counting the extra ones as dropped", () => {
    const result = groundPicks(
      ["ECO 101", "SOC 101", "BIO 331"].map((c) => pick(c)),
      CANDIDATES,
      { ...options, maxItems: 2 },
    );
    expect(result.items).toHaveLength(2);
    expect(result.dropped).toEqual([]);
  });

  it("cleans the reason and falls back when nothing is left of it", () => {
    const result = groundPicks(
      [
        pick("ECO 101", "202602", "An easy A with a light workload."),
        pick("SOC 101", "202602", "See https://x.example"),
      ],
      CANDIDATES,
      options,
    );
    expect(result.items.map((i) => i.reason)).toEqual(["Fallback reason.", "See"]);
  });

  it("drops reason sentences naming courses outside the candidates and the plan, or giving dates", () => {
    const result = groundPicks(
      [
        pick(
          "ECO 101",
          "202602",
          "Take it together with ECO 999 and FAK 123 next spring. Counts toward SSRQ.",
        ),
        pick("SOC 101", "202602", "Builds on ECO 101 and your CSC 121. Apply by November 15."),
        pick("ART 111", "202602", "Pairs with PSY 303 in the same term."),
      ],
      CANDIDATES,
      { ...options, taken: new Set(["CSC 121"]) },
    );
    expect(result.items.map((i) => i.reason)).toEqual([
      "Counts toward SSRQ.",
      "Builds on ECO 101 and your CSC 121.",
      // PSY 303 is a cross-listing of the BIO 331 candidate.
      "Pairs with PSY 303 in the same term.",
    ]);
  });

  it("applies the caller's own reason filter", () => {
    const result = groundPicks(
      [pick("ECO 101", "202602", "Great for the Major in Magic.")],
      CANDIDATES,
      {
        ...options,
        reasonFilter: (text) => /Magic/.test(text),
      },
    );
    expect(result.items[0]?.reason).toBe("Fallback reason.");
  });
});

describe("stillOffered", () => {
  it("holds while every stored item is a candidate for its term with the same basis", () => {
    const items = [
      { courseCode: "ECO 101", termCode: "202602", basis: "scheduled" as const },
      { courseCode: "PSY 303", termCode: "202602", basis: "scheduled" as const },
      { courseCode: "MUS 101", termCode: "202701", basis: "past-offerings" as const },
    ];
    expect(stillOffered(items, CANDIDATES)).toBe(true);
    // No longer a candidate (dropped from the term, or no longer fills an open slot).
    expect(
      stillOffered(
        items,
        CANDIDATES.filter((c) => c.courseCode !== "ECO 101"),
      ),
    ).toBe(false);
    // The term got scheduled: the past-offerings pick is stale.
    const scheduled = CANDIDATES.map((c) =>
      c.courseCode === "MUS 101" ? candidate("MUS 101", { "202701": "scheduled" }) : c,
    );
    expect(stillOffered(items, scheduled)).toBe(false);
  });
});
