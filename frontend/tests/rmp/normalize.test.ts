import { describe, expect, it } from "vitest";
import {
  indexTokens,
  isStaffName,
  lookupTokens,
  nameTokens,
  normalizeName,
  surnameTokens,
} from "@/server/rmp/normalize";

describe("normalizeName (PLAN §5 Ratings: one normal form for both sides)", () => {
  it.each([
    ["José", "jose"],
    ["Zoë", "zoe"],
    ["Núñez", "nunez"],
    ["Łukasz", "lukasz"],
    ["Søren", "soren"],
    ["Æsa", "aesa"],
    ["Weiß", "weiss"],
    ["ＦＵＬＬ", "full"],
  ])("strips accents and folds compatibility forms: %s → %s", (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });

  it("lower-cases and trims trailing spaces (RMP 'Bond ', 'Alesha ')", () => {
    expect(normalizeName("Bond ")).toBe("bond");
    expect(normalizeName("  Alesha  ")).toBe("alesha");
    expect(normalizeName("Tripathi ")).toBe("tripathi");
  });

  it("removes every kind of apostrophe, including RMP's doubled O''Geen", () => {
    for (const raw of ["O'Geen", "O''Geen", "O’Geen", "Oʼ'Geen", "O`Geen", "OGeen"]) {
      expect(normalizeName(raw)).toBe("ogeen");
    }
    expect(normalizeName("O'Keefe")).toBe("okeefe");
  });

  it("turns hyphens, dashes, periods and underscores into token boundaries", () => {
    expect(normalizeName("Vaz-Hooper")).toBe("vaz hooper");
    expect(normalizeName("Vaz–Hooper")).toBe("vaz hooper");
    expect(normalizeName("St. Clair")).toBe("st clair");
    expect(normalizeName("St Clair")).toBe("st clair");
    expect(normalizeName("J.R.")).toBe("j r");
    expect(normalizeName("Sainte-Claire")).toBe("sainte claire");
  });

  it("collapses whitespace and drops other punctuation", () => {
    expect(normalizeName("Villa   Keith")).toBe("villa keith");
    expect(normalizeName("Smith (Jr)")).toBe("smith jr");
    expect(normalizeName("")).toBe("");
    expect(normalizeName("  ")).toBe("");
  });
});

describe("tokens", () => {
  it("splits names into normalised tokens", () => {
    expect(nameTokens("Gouri Suresh")).toEqual(["gouri", "suresh"]);
    expect(nameTokens("")).toEqual([]);
  });

  it("drops generational suffixes from surnames, unless the suffix is all there is", () => {
    expect(surnameTokens("Smith Jr.")).toEqual(["smith"]);
    expect(surnameTokens("King III")).toEqual(["king"]);
    expect(surnameTokens("Jr")).toEqual(["jr"]);
  });

  it("indexes both names plus the surname as one word; looks up by surname tokens", () => {
    expect(indexTokens("Onita", "Vaz-Hooper")).toEqual(["onita", "vaz", "hooper", "vazhooper"]);
    expect(indexTokens("Katie", "St. Clair")).toEqual(["katie", "st", "clair", "stclair"]);
    expect(indexTokens("Andrew", "O''Geen")).toEqual(["andrew", "ogeen"]);
    expect(lookupTokens("Villa Keith")).toEqual(["villa", "keith", "villakeith"]);
    expect(lookupTokens("Keith")).toEqual(["keith"]);
  });
});

describe("isStaffName", () => {
  it("recognises the course API's Staff placeholder in any case", () => {
    expect(isStaffName("S", "Staff")).toBe(true);
    expect(isStaffName("", "STAFF ")).toBe(true);
    expect(isStaffName("", "TBA")).toBe(true);
    expect(isStaffName("Staff", "")).toBe(true);
  });

  it("does not treat real surnames that contain 'staff' as staff", () => {
    expect(isStaffName("Anna", "Stafford")).toBe(false);
    expect(isStaffName("Staff", "Sergeant")).toBe(false);
  });
});
