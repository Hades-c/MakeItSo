import { describe, expect, it } from "vitest";
import {
  CAREER_QUERY_MAX,
  careersHref,
  clusterFromSlug,
  clusterSlug,
  filterCareers,
  parseCareerFilters,
} from "@/app/(hub)/careers/_lib/filters";
import { CAREER_CLUSTERS } from "@/lib/types/content";
import { CAREERS } from "@/server/content/careers";

const slugs = (careers: readonly { slug: string }[]) => careers.map((career) => career.slug);
const getCareerBySlug = (slug: string) => CAREERS.find((career) => career.slug === slug)!;

describe("career clusters in the URL", () => {
  it("round-trips every cluster through a readable slug", () => {
    expect(clusterSlug("Business & Finance")).toBe("business-and-finance");
    expect(clusterSlug("Science & Environment")).toBe("science-and-environment");
    expect(clusterSlug("Technology")).toBe("technology");
    for (const cluster of CAREER_CLUSTERS) {
      expect(clusterSlug(cluster)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(clusterFromSlug(clusterSlug(cluster))).toBe(cluster);
    }
    expect(new Set(CAREER_CLUSTERS.map(clusterSlug)).size).toBe(CAREER_CLUSTERS.length);
  });

  it("knows no other slug", () => {
    for (const slug of ["", "Technology", "business", "business-&-finance", null, undefined]) {
      expect(clusterFromSlug(slug)).toBeNull();
    }
  });
});

describe("parseCareerFilters", () => {
  it("reads the cluster and the text", () => {
    expect(parseCareerFilters({ cluster: "health", q: "  pre-med   track " })).toEqual({
      cluster: "Health",
      q: "pre-med track",
    });
  });

  it("ignores what it cannot use instead of failing the page", () => {
    expect(parseCareerFilters(undefined)).toEqual({ cluster: null, q: "" });
    expect(parseCareerFilters({ cluster: "astrology", q: "" })).toEqual({ cluster: null, q: "" });
    // Repeated parameters: the first counts.
    expect(parseCareerFilters({ cluster: ["technology", "health"], q: ["data", "x"] })).toEqual({
      cluster: "Technology",
      q: "data",
    });
    expect(parseCareerFilters({ q: "x".repeat(500) }).q).toHaveLength(CAREER_QUERY_MAX);
  });
});

describe("filterCareers", () => {
  it("returns every career, in order, without filters", () => {
    expect(filterCareers(CAREERS, { cluster: null, q: "" })).toEqual([...CAREERS]);
  });

  it("filters by cluster", () => {
    const tech = filterCareers(CAREERS, { cluster: "Technology", q: "" });
    expect(tech.length).toBeGreaterThan(0);
    expect(tech.every((career) => career.cluster === "Technology")).toBe(true);
    expect(tech.length).toBe(CAREERS.filter((c) => c.cluster === "Technology").length);
  });

  it("matches every word of the text, accents and case folded", () => {
    expect(slugs(filterCareers(CAREERS, { cluster: null, q: "Software Engineering" }))).toContain(
      "software-engineering",
    );
    // A course code names the careers that list it.
    const withCsc221 = CAREERS.filter((c) => c.courses.some((course) => course.code === "CSC 221"));
    expect(withCsc221.length).toBeGreaterThan(0);
    expect(slugs(filterCareers(CAREERS, { cluster: null, q: "csc 221" }))).toEqual(
      expect.arrayContaining(slugs(withCsc221)),
    );
    // Every word has to match somewhere.
    expect(filterCareers(CAREERS, { cluster: null, q: "software zzzqqq" })).toEqual([]);
  });

  it("matches at the start of a word, never inside one", () => {
    const art = slugs(filterCareers(CAREERS, { cluster: null, q: "art" }));
    // "art" is Art, Arts, "Digital Art"; not "start", "smart" or "department".
    expect(art).toContain("arts-museum-curation");
    for (const slug of [
      "software-engineering",
      "investment-banking",
      "medicine",
      "sports-management",
    ]) {
      expect(art).not.toContain(slug);
    }
    expect(art.length).toBeLessThan(10);
    // "ai" is not in "maintain" or "detail".
    const ai = filterCareers(CAREERS, { cluster: null, q: "ai" });
    for (const career of ai) {
      const words = `${career.name} ${career.summary} ${career.whatYouDo.join(" ")}`.toLowerCase();
      expect(words).toMatch(/\bai/);
    }
    // A word's start still finds it: "econ" → Economics, "221" → CSC 221.
    expect(slugs(filterCareers(CAREERS, { cluster: null, q: "econ" }))).toContain(
      "investment-banking",
    );
    expect(slugs(filterCareers(CAREERS, { cluster: null, q: "221" }))).toContain(
      "software-engineering",
    );
  });

  it("finds a whole word of a career's description, singular or plural", () => {
    const hospital = CAREERS.filter((c) =>
      /\bhospitals?\b/i.test([c.summary, ...c.whatYouDo].join(" ")),
    );
    expect(hospital.length).toBeGreaterThan(0);
    expect(slugs(filterCareers(CAREERS, { cluster: null, q: "hospital" }))).toEqual(
      slugs(hospital),
    );
    // Only whole words of the prose: "doctor" does not find Research & Academia's "doctorate".
    const research = getCareerBySlug("research-academia");
    expect([research.summary, ...research.whatYouDo].join(" ")).toMatch(/\bdoctorate\b/i);
    expect(slugs(filterCareers(CAREERS, { cluster: null, q: "doctor" }))).not.toContain(
      "research-academia",
    );
  });

  it("combines the cluster and the text", () => {
    const result = filterCareers(CAREERS, { cluster: "Health", q: "software" });
    expect(result.every((career) => career.cluster === "Health")).toBe(true);
  });
});

describe("careersHref", () => {
  it("builds /careers with the slug and the trimmed text", () => {
    expect(careersHref()).toBe("/careers");
    expect(careersHref({ cluster: "Business & Finance" })).toBe(
      "/careers?cluster=business-and-finance",
    );
    expect(careersHref({ cluster: null, q: "  data  " })).toBe("/careers?q=data");
    expect(careersHref({ cluster: "Health", q: "pre med" })).toBe(
      "/careers?cluster=health&q=pre+med",
    );
  });
});
