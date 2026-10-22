import { describe, expect, it } from "vitest";
import { findSmallFontSizes, toPx } from "../../scripts/check-built-css.mjs";

describe("check-built-css", () => {
  it("converts absolute units and ignores relative or computed ones", () => {
    expect(toPx("11px")).toBe(11);
    expect(toPx(".75rem")).toBe(12);
    expect(toPx("9pt")).toBe(12);
    expect(toPx("80%")).toBeNull();
    expect(toPx("var(--text-xs)")).toBeNull();
    expect(toPx("inherit")).toBeNull();
  });

  it("flags declarations and type tokens below 12px", () => {
    const css =
      ":root{--text-xs:.75rem;--text-xs--line-height:1rem;--text-2xs:.65rem;--text-2xs--letter-spacing:.01em}" +
      ".a{font-size:var(--text-xs)}.b{font-size:11px}.c{font-size:.75rem}small{font-size:80%}.d{font-size:10.5px!important}";
    expect(findSmallFontSizes(css)).toEqual([
      "font-size: 11px (11px)",
      "font-size: 10.5px (10.5px)",
      "--text-2xs: .65rem (10.4px)",
    ]);
  });

  it("passes a stylesheet that respects the floor", () => {
    expect(findSmallFontSizes(".a{font-size:12px}.b{font-size:1rem}")).toEqual([]);
  });
});
