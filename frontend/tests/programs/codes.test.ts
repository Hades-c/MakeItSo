import { describe, expect, it } from "vitest";
import { courseCodesIn, listedCode } from "@/server/programs/codes";

const PHYSICS = {
  aliases: [{ word: "Physics", prefix: "PHY" }],
  departmentPrefix: "PHY",
  listed: new Set([
    "PHY 118",
    "PHY 120",
    "PHY 125",
    "PHY 130",
    "PHY 150",
    "PHY 220",
    "PHY 225",
    "PHY 230",
    "PHY 235",
    "PHY 305",
    "PHY 315",
    "PHY 330",
    "PHY 335",
    "PHY 350",
    "PHY 360",
    "PHY 400",
    "PHY 460",
  ]),
};

describe("courseCodesIn: codes written with a prefix", () => {
  it("normalises, de-duplicates and keeps the order of first mention", () => {
    expect(
      courseCodesIn("Take ARB496 or CSC 121, then CSC 121L and CSC 121 again (= BIO 209)."),
    ).toEqual(["ARB 496", "CSC 121", "CSC 121L", "BIO 209"]);
  });

  it("ignores words that are not course prefixes and numbers that are not course numbers", () => {
    expect(courseCodesIn("A GPA 300 or SAT 1400; CEFR B2; US 101; PHY 1000; MAT 11")).toEqual([]);
  });

  it("reads numbers listed after a code with the same prefix", () => {
    expect(courseCodesIn("SPA 271 and 272 in sequence")).toEqual(["SPA 271", "SPA 272"]);
    expect(courseCodesIn("BIO 115 and 116; CHE 115, 220, 250, 350 or 351")).toEqual([
      "BIO 115",
      "BIO 116",
      "CHE 115",
      "CHE 220",
      "CHE 250",
      "CHE 350",
      "CHE 351",
    ]);
    expect(courseCodesIn("either HIS 480 or HIS 488-9")).toEqual(["HIS 480", "HIS 488"]);
  });

  it("skips range bounds and thresholds (none of these are courses)", () => {
    expect(courseCodesIn("FRE 310-319 = Advanced Studies in Literature")).toEqual([]);
    expect(courseCodesIn("one course in each area (POL 120-139, POL 160-179)")).toEqual([]);
    expect(courseCodesIn("five courses in Greek numbered above GRE 200")).toEqual([]);
    expect(courseCodesIn("9 courses above FRE 201 as follows")).toEqual([]);
    expect(courseCodesIn("FRE 201 or above; SPA 260 level and above")).toEqual([]);
    expect(courseCodesIn("in addition to CSC 121, prior to MAT 150")).toEqual([
      "CSC 121",
      "MAT 150",
    ]);
  });

  it("does not read a year or a list bullet as the end of a range", () => {
    expect(
      courseCodesIn("- HIS 183 - East Asian History to 1850\n- HIS 184 - Modern East Asia"),
    ).toEqual(["HIS 183", "HIS 184"]);
  });
});

describe("courseCodesIn: the page's subject word and bare numbers", () => {
  it("reads a page's own subject word, including runs of numbers after it", () => {
    expect(
      courseCodesIn("Physics 120, 125 or 130 is a prerequisite; Physics 230 and 235; physics 999", {
        aliases: PHYSICS.aliases,
      }),
    ).toEqual(["PHY 120", "PHY 125", "PHY 130", "PHY 230", "PHY 235"]);
    expect(
      courseCodesIn("with the exceptions of Economics 180-184, and of Economics 211-214", {
        aliases: [{ word: "Economics", prefix: "ECO" }],
      }),
    ).toEqual([]);
  });

  it("on a department page, reads bare numbers the page's course lists name", () => {
    expect(
      courseCodesIn(
        "one course chosen from 220, 225, 230, or 235; plus 305, 315, 330, 335, 350, and 360; and one course chosen from courses numbered 400 to 460.",
        PHYSICS,
      ),
    ).toEqual([
      "PHY 220",
      "PHY 225",
      "PHY 230",
      "PHY 235",
      "PHY 305",
      "PHY 315",
      "PHY 330",
      "PHY 335",
      "PHY 350",
      "PHY 360",
    ]);
    // 999 is not a listed Physics course; 100-level is a level, not a course.
    expect(courseCodesIn("Two of 120, 999 and any 100-level course", PHYSICS)).toEqual(["PHY 120"]);
  });

  it("does not map another subject's numbers to the page's prefix", () => {
    expect(
      courseCodesIn("Either Physics 250 or both Mathematics 150 and 160 will satisfy it", PHYSICS),
    ).toEqual(["PHY 250"]);
  });

  it("reads no bare numbers without a department prefix and course lists", () => {
    expect(courseCodesIn("two of 105, 106, 107")).toEqual([]);
    expect(courseCodesIn("two of 105, 106, 107", { departmentPrefix: "PHI" })).toEqual([]);
    expect(
      courseCodesIn("two of 105, 106, 107", {
        departmentPrefix: "PHI",
        listed: new Set(["PHI 105", "PHI 106", "PHI 107"]),
      }),
    ).toEqual(["PHI 105", "PHI 106", "PHI 107"]);
  });
});

describe("listedCode", () => {
  it("reads the code a course list entry starts with", () => {
    expect(listedCode("BIO 209 - Bioinformatics Programming")).toBe("BIO 209");
    expect(listedCode("ENG 360A - Desire")).toBe("ENG 360A");
    expect(listedCode("Independent Study")).toBeNull();
  });
});
