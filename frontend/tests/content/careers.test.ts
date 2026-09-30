import { describe, expect, it } from "vitest";
import { CAREER_CLUSTERS } from "@/lib/types/content";
import {
  CAREER_SLUGS,
  careerCourseCodes,
  CAREERS,
  careersByCluster,
  getCareer,
  isCareerSlug,
} from "@/server/content/careers";

/** The 24 slugs the app has always used (PLAN §3: kept; unknown slug → notFound()). */
const SLUGS = [
  "software-engineering",
  "data-science",
  "investment-banking",
  "management-consulting",
  "product-management",
  "medicine",
  "law",
  "marketing",
  "research-academia",
  "public-policy",
  "entrepreneurship",
  "ux-design",
  "nonprofit",
  "education",
  "journalism",
  "environmental-science",
  "cybersecurity",
  "financial-planning",
  "psychology-counseling",
  "international-development",
  "architecture-urban-planning",
  "sports-management",
  "healthcare-administration",
  "arts-museum-curation",
];

describe("careers", () => {
  it("keeps the 24 slugs, in order", () => {
    expect([...CAREER_SLUGS]).toEqual(SLUGS);
    expect(CAREERS).toHaveLength(24);
  });

  it("looks careers up by slug", () => {
    expect(getCareer("software-engineering")?.name).toBe("Software Engineering");
    expect(getCareer("career-that-does-not-exist")).toBeUndefined();
    expect(getCareer("__proto__")).toBeUndefined();
    expect(isCareerSlug("law")).toBe(true);
    expect(isCareerSlug("Law")).toBe(false);
  });

  it("carries the verified corrections, not the hackathon data", () => {
    const swe = getCareer("software-engineering")!;
    const codes = swe.courses.map((c) => c.code);
    // Old app: CSC 222 / CSC 231 / MAT 150 "Discrete" / CSC 371 "Software Engineering" were wrong.
    expect(codes).toEqual([
      "CSC 121",
      "CSC 221",
      "MAT 230",
      "CSC 250",
      "CSC 321",
      "CSC 312",
      "CSC 351",
      "CSC 359",
    ]);
    expect(swe.courses.find((c) => c.code === "CSC 221")?.title).toBe("Data Structures");
    expect(swe.pay).toMatchObject({ medianAnnual: 135980, period: "May 2025" });
    for (const career of CAREERS) {
      expect(career.courses.length).toBeGreaterThanOrEqual(6);
      expect(new Set(career.courses.map((c) => c.code)).size).toBe(career.courses.length);
    }
  });

  it("stores no per-term availability or alumni matching keywords (computed live)", () => {
    for (const career of CAREERS) {
      expect(Object.keys(career)).not.toContain("alumniMatch");
      expect(Object.keys(career)).not.toContain("notes");
      for (const course of career.courses)
        expect(Object.keys(course).sort()).toEqual(["code", "title", "why"]);
    }
  });

  it("holds back the three verified courses the fixture terms do not carry", () => {
    const all = careerCourseCodes();
    for (const code of ["SOC 226", "ECO 329", "ART 348"]) expect(all).not.toContain(code);
    expect(getCareer("sports-management")!.courses).toHaveLength(6);
    expect(getCareer("arts-museum-curation")!.courses).toHaveLength(6);
  });

  it("groups careers by cluster in the contract's order", () => {
    const groups = careersByCluster();
    expect(groups.map((g) => g.cluster)).toEqual(
      CAREER_CLUSTERS.filter((cluster) => CAREERS.some((c) => c.cluster === cluster)),
    );
    expect(groups.flatMap((g) => g.careers)).toHaveLength(24);
    expect(groups.find((g) => g.cluster === "Technology")?.careers.map((c) => c.slug)).toEqual([
      "software-engineering",
      "data-science",
      "product-management",
      "ux-design",
      "cybersecurity",
    ]);
  });

  it("lists every course code once, sorted", () => {
    const codes = careerCourseCodes();
    expect(codes).toEqual([...new Set(codes)].sort());
    expect(codes).toContain("CSC 221");
    expect(codes.length).toBeGreaterThan(100);
  });

  it("links resources over https and keeps Handshake keywords", () => {
    for (const career of CAREERS) {
      expect(career.handshakeQuery.trim()).not.toBe("");
      for (const resource of [...career.davidsonResources, ...career.externalResources]) {
        expect(resource.url).toMatch(/^https:\/\//);
      }
    }
  });
});
