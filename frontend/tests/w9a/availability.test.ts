import { describe, expect, it } from "vitest";
import {
  addToPlanTerms,
  careerTermCodes,
  courseLinkTerm,
  defaultAddTerm,
  joinTermLabels,
  usuallyOfferedText,
  type CareerTerms,
} from "@/app/(hub)/careers/_lib/availability";
import type { Availability } from "@/lib/types/catalog";

/** Server "now" 2026-09-30: current Fall 2026, registration Spring 2027, next Fall 2027 (unpublished). */
const TERMS: CareerTerms = { current: "202601", registration: "202602", next: "202701" };

const history = (...entries: Availability[]) => entries;

describe("careerTermCodes", () => {
  it("is current, registration, next, without repeats", () => {
    expect(careerTermCodes(TERMS)).toEqual(["202601", "202602", "202701"]);
    expect(careerTermCodes({ current: "202602", registration: "202602", next: "202701" })).toEqual([
      "202602",
      "202701",
    ]);
  });
});

describe("addToPlanTerms", () => {
  it("maps each term's catalog status, with section counts and the usual season", () => {
    const terms = addToPlanTerms(
      history(
        { termCode: "202501", status: "offered", sectionCount: 2 },
        { termCode: "202601", status: "offered", sectionCount: 3 },
        { termCode: "202602", status: "not-offered" },
        {
          termCode: "202701",
          status: "not-yet-published",
          usually: { season: "Fall", basedOn: ["202401", "202501", "202601"] },
        },
      ),
      TERMS,
    );
    expect(terms).toEqual([
      { code: "202601", label: "Fall 2026", availability: "offered", sectionCount: 3 },
      { code: "202602", label: "Spring 2027", availability: "not-offered" },
      {
        code: "202701",
        label: "Fall 2027",
        availability: "not-yet-published",
        note: "Usually offered in Fall",
      },
    ]);
  });

  it("never turns an unpublished term into a bare offered, and says nothing without a claim", () => {
    const [next] = addToPlanTerms(
      history({ termCode: "202701", status: "not-yet-published" }),
      TERMS,
    );
    expect(next).toEqual({ code: "202701", label: "Fall 2027", availability: "not-yet-published" });
  });

  it("leaves out a term the catalog does not report (unknown, not a guess)", () => {
    const terms = addToPlanTerms(
      history({ termCode: "202602", status: "offered", sectionCount: 1 }),
      TERMS,
    );
    expect(terms.map((term) => term.code)).toEqual(["202602"]);
    expect(addToPlanTerms([], TERMS)).toEqual([]);
  });
});

describe("defaultAddTerm", () => {
  const offered = (code: string) => ({ code, label: code, availability: "offered" as const });
  const notOffered = (code: string) => ({
    code,
    label: code,
    availability: "not-offered" as const,
  });
  const unpublished = (code: string) => ({
    code,
    label: code,
    availability: "not-yet-published" as const,
  });

  it("starts on the registration term when it can be chosen", () => {
    expect(defaultAddTerm([offered("202601"), offered("202602")], "202602")).toBe("202602");
  });

  it("falls back to the first term that can be chosen", () => {
    expect(
      defaultAddTerm([notOffered("202601"), notOffered("202602"), unpublished("202701")], "202602"),
    ).toBe("202701");
    expect(defaultAddTerm([offered("202601"), notOffered("202602")], "202602")).toBe("202601");
  });

  it("is null when no term can be chosen", () => {
    expect(defaultAddTerm([notOffered("202601"), notOffered("202602")], "202602")).toBeNull();
    expect(defaultAddTerm([], "202602")).toBeNull();
  });
});

describe("usuallyOfferedText", () => {
  it("names the season and the terms it is based on", () => {
    expect(
      usuallyOfferedText({
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202401", "202601"] },
      }),
    ).toBe("Usually offered in Fall (based on Fall 2024 and Fall 2026)");
    expect(
      usuallyOfferedText({
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202401", "202501", "202601"] },
      }),
    ).toBe("Usually offered in Fall (based on Fall 2024, Fall 2025 and Fall 2026)");
  });

  it("is null without a claim or for a published term", () => {
    expect(usuallyOfferedText({ termCode: "202701", status: "not-yet-published" })).toBeNull();
    expect(
      usuallyOfferedText({ termCode: "202602", status: "offered", sectionCount: 1 }),
    ).toBeNull();
  });
});

describe("joinTermLabels", () => {
  it("reads like a sentence", () => {
    expect(joinTermLabels([])).toBe("");
    expect(joinTermLabels(["202601"])).toBe("Fall 2026");
    expect(joinTermLabels(["202502", "202602"])).toBe("Spring 2026 and Spring 2027");
  });
});

describe("courseLinkTerm", () => {
  it("prefers the registration term, then the current one, then the latest past term", () => {
    const all = history(
      { termCode: "202501", status: "offered", sectionCount: 1 },
      { termCode: "202601", status: "offered", sectionCount: 1 },
      { termCode: "202602", status: "offered", sectionCount: 1 },
    );
    expect(courseLinkTerm(all, TERMS)).toBe("202602");
    expect(courseLinkTerm(all.slice(0, 2), TERMS)).toBe("202601");
    expect(
      courseLinkTerm(
        history(
          { termCode: "202402", status: "offered", sectionCount: 1 },
          { termCode: "202502", status: "offered", sectionCount: 1 },
          { termCode: "202601", status: "not-offered" },
        ),
        TERMS,
      ),
    ).toBe("202502");
  });

  it("is null for a course that ran in no known term", () => {
    expect(
      courseLinkTerm(history({ termCode: "202701", status: "not-yet-published" }), TERMS),
    ).toBeNull();
  });
});
