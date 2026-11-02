import { describe, expect, it } from "vitest";
import { CAREERS_BY_SLUG } from "@/app/(hub)/alumni/_lib/careers";
import {
  filterSamples,
  hasSampleFilters,
  initialsOf,
  NO_SAMPLE_FILTERS,
  parseSampleFilters,
  sampleFacets,
  samplePreviewHref,
} from "@/app/(hub)/alumni/preview/_lib/sample-directory";
import { SAMPLE_ALUMNI } from "@/server/content/alumni-sample";
import { CAREER_SLUGS } from "@/server/content/careers";

/** The preview's URL filters (app/(hub)/alumni/preview/_lib/sample-directory.ts). */

describe("parseSampleFilters", () => {
  it("reads known values and ignores the rest", () => {
    expect(
      parseSampleFilters(
        { career: "law", year: "2016", industry: "government-policy", q: "  aide " },
        CAREER_SLUGS,
      ),
    ).toEqual({ career: "law", year: 2016, industry: "Government & policy", q: "aide" });
    expect(
      parseSampleFilters({ career: "astronaut", year: "16", industry: "x" }, CAREER_SLUGS),
    ).toEqual(NO_SAMPLE_FILTERS);
    expect(parseSampleFilters(undefined, CAREER_SLUGS)).toEqual(NO_SAMPLE_FILTERS);
    expect(hasSampleFilters(NO_SAMPLE_FILTERS)).toBe(false);
  });
});

describe("filterSamples", () => {
  it("matches every word against what the card shows", () => {
    const hit = (q: string) =>
      filterSamples(SAMPLE_ALUMNI, { ...NO_SAMPLE_FILTERS, q }, CAREERS_BY_SLUG).map((r) => r.id);
    expect(hit("hollis")).toEqual(["sample-megan-hollis"]);
    expect(hit("charlotte fintech")).toEqual(["sample-megan-hollis"]);
    // Career names, cities and help topics are searchable too.
    expect(hit("software engineering").length).toBeGreaterThan(1);
    expect(hit("nashville").length).toBeGreaterThan(0);
    expect(hit("job shadowing").length).toBeGreaterThan(0);
    expect(hit("nobody-at-all")).toEqual([]);
  });

  it("combines career, year and industry", () => {
    const shown = filterSamples(
      SAMPLE_ALUMNI,
      { career: "software-engineering", year: null, industry: "Financial services", q: "" },
      CAREERS_BY_SLUG,
    );
    expect(shown.map((r) => r.id)).toEqual(["sample-kevin-ashford"]);
  });
});

describe("sampleFacets", () => {
  it("offers only values the sample profiles have, with counts over all of them", () => {
    const facets = sampleFacets(SAMPLE_ALUMNI, CAREERS_BY_SLUG);
    expect(facets.careers).toHaveLength(24);
    expect(facets.careers.map((o) => o.label)).toEqual(
      [...facets.careers.map((o) => o.label)].sort((a, b) => a.localeCompare(b)),
    );
    const years = facets.years.map((o) => o.value);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(facets.industries.reduce((sum, o) => sum + o.count, 0)).toBe(SAMPLE_ALUMNI.length);
  });
});

describe("samplePreviewHref / initialsOf", () => {
  it("builds the preview URL with its filters", () => {
    expect(samplePreviewHref()).toBe("/alumni/preview");
    expect(
      samplePreviewHref({ career: "law", year: 2016, industry: "Government & policy", q: "aide" }),
    ).toBe("/alumni/preview?career=law&year=2016&industry=government-policy&q=aide");
  });

  it("takes the first and last initials", () => {
    expect(initialsOf("Megan Hollis")).toBe("MH");
    expect(initialsOf("Ana María de la Cruz")).toBe("AC");
    expect(initialsOf("Prince")).toBe("P");
  });
});
