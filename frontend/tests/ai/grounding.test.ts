import { describe, expect, it } from "vitest";
import { MAX_DROPPED_SHARE } from "@/server/ai/config";
import { groundPicks, type GroundingCandidate } from "@/server/ai/grounding";

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
});
