import { describe, expect, it } from "vitest";
import { isTermCode, parseTermCode, termLabel } from "@/lib/term";

describe("term codes", () => {
  it("maps YYYY01 to Fall YYYY and YYYY02 to Spring YYYY+1", () => {
    expect(parseTermCode("202601")).toEqual({
      code: "202601",
      season: "Fall",
      year: 2026,
      label: "Fall 2026",
    });
    expect(termLabel("202602")).toBe("Spring 2027");
    expect(termLabel("202502")).toBe("Spring 2026");
  });

  it("rejects anything else", () => {
    for (const bad of ["202603", "20260", "2026-01", "abc", ""]) {
      expect(isTermCode(bad)).toBe(false);
      expect(parseTermCode(bad)).toBeNull();
    }
    expect(termLabel("nope")).toBe("nope");
  });
});
