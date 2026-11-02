import { describe, expect, it } from "vitest";
import { AlumnusSchema } from "@/lib/types/content";
import { ALUMNI, EXCLUDED_PENDING_OWNER } from "@/server/content/alumni";
import {
  DAVIDSON_CONNECT,
  SAMPLE_ALUMNI,
  SAMPLE_INDUSTRIES,
  SampleAlumnusSchema,
  sampleAlumniCountForCareer,
  sampleAlumniDirectory,
  sampleIndustryFromSlug,
  sampleIndustrySlug,
} from "@/server/content/alumni-sample";
import { CAREER_SLUGS } from "@/server/content/careers";

/**
 * The Davidson Connect preview's sample profiles (server/content/alumni-sample.ts): fictional, labelled sample in
 * their own shape, no real person or company, and enough of them to fill every career path's preview.
 */

/** Places an organization descriptor may name ("a Charlotte fintech startup"); anything else capitalised fails. */
const PLACE_WORDS = new Set(["Charlotte", "Seattle"]);

describe("sample alumni (Davidson Connect preview)", () => {
  it("holds 24-30 sample profiles, each marked sample with a sample- id", () => {
    expect(SAMPLE_ALUMNI.length).toBeGreaterThanOrEqual(24);
    expect(SAMPLE_ALUMNI.length).toBeLessThanOrEqual(30);
    for (const record of SAMPLE_ALUMNI) {
      expect(record.sample).toBe(true);
      expect(record.id).toMatch(/^sample-/);
    }
    expect(new Set(SAMPLE_ALUMNI.map((r) => r.id)).size).toBe(SAMPLE_ALUMNI.length);
    expect(new Set(SAMPLE_ALUMNI.map((r) => r.name)).size).toBe(SAMPLE_ALUMNI.length);
  });

  it("gives every one of the 24 career paths at least one sample profile", () => {
    expect(CAREER_SLUGS).toHaveLength(24);
    for (const slug of CAREER_SLUGS) {
      expect(sampleAlumniCountForCareer(slug), slug).toBeGreaterThan(0);
    }
  });

  it("never reuses a real alumnus's name or id (listed or held back)", () => {
    const realNames = new Set([
      ...ALUMNI.map((a) => a.name.toLowerCase()),
      ...EXCLUDED_PENDING_OWNER.map((e) => e.name.toLowerCase()),
    ]);
    const realIds = new Set(ALUMNI.map((a) => a.id));
    for (const record of SAMPLE_ALUMNI) {
      expect(realNames.has(record.name.toLowerCase()), record.name).toBe(false);
      expect(realIds.has(record.id)).toBe(false);
      expect(realIds.has(record.id.replace(/^sample-/, "")), record.id).toBe(false);
    }
  });

  it("cannot pass for a verified alumnus: the strict Alumnus schema rejects every sample", () => {
    for (const record of SAMPLE_ALUMNI) {
      expect(AlumnusSchema.safeParse(record).success, record.id).toBe(false);
    }
    // And the other way round: a verified record is not a sample.
    expect(SampleAlumnusSchema.safeParse(ALUMNI[0]).success).toBe(false);
  });

  it("names organizations only as generic descriptors, never a company", () => {
    for (const record of SAMPLE_ALUMNI) {
      expect(record.organization, record.id).toMatch(/^an? /);
      const capitalised = record.organization
        .split(/\s+/)
        .slice(1)
        .filter((word) => /^[A-Z]/.test(word));
      expect(
        capitalised.filter((word) => !PLACE_WORDS.has(word)),
        record.id,
      ).toEqual([]);
    }
  });

  it("never pairs a descriptor with a place where it singles out one real organization", () => {
    // Pairs a review found, each pointing to one employer (2026-11-02): kept so they cannot come back.
    const singleEmployer = [
      ["public research university", "Columbia, SC"],
      ["state budget office", "Raleigh, NC"],
      ["state environmental agency", "Raleigh, NC"],
      ["city planning department", "Charlotte, NC"],
      ["academic medical center", "Durham, NC"],
      ["professional soccer club", "Charlotte, NC"],
      ["contemporary art museum", "Atlanta, GA"],
    ];
    for (const record of SAMPLE_ALUMNI) {
      for (const [descriptor, location] of singleEmployer) {
        expect(
          record.organization.includes(descriptor!) && record.location === location,
          `${record.id}: ${record.organization}, ${record.location}`,
        ).toBe(false);
      }
    }
  });

  it("rejects a record that is not marked sample, a real-looking id, or an unknown major or path", () => {
    const base = { ...SAMPLE_ALUMNI[0]! };
    expect(SampleAlumnusSchema.safeParse(base).success).toBe(true);
    expect(SampleAlumnusSchema.safeParse({ ...base, sample: false }).success).toBe(false);
    expect(SampleAlumnusSchema.safeParse({ ...base, id: "megan-hollis" }).success).toBe(false);
    expect(SampleAlumnusSchema.safeParse({ ...base, majors: ["Astrology"] }).success).toBe(false);
    expect(SampleAlumnusSchema.safeParse({ ...base, careerPathSlugs: ["astronaut"] }).success).toBe(
      false,
    );
    expect(
      SampleAlumnusSchema.safeParse({ ...base, organization: "Acme Corporation" }).success,
    ).toBe(false);
    expect(
      SampleAlumnusSchema.safeParse({ ...base, photoUrl: "https://example.org/a.jpg" }).success,
    ).toBe(false);
  });

  it("is frozen and listed newest class first", () => {
    expect(Object.isFrozen(SAMPLE_ALUMNI)).toBe(true);
    expect(Object.isFrozen(SAMPLE_ALUMNI[0])).toBe(true);
    const years = sampleAlumniDirectory().map((r) => r.classYear);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("round-trips industry slugs", () => {
    for (const industry of SAMPLE_INDUSTRIES) {
      expect(sampleIndustryFromSlug(sampleIndustrySlug(industry))).toBe(industry);
    }
    expect(sampleIndustrySlug("Government & policy")).toBe("government-policy");
    expect(sampleIndustryFromSlug("astrology")).toBeNull();
    expect(sampleIndustryFromSlug(undefined)).toBeNull();
  });

  it("sources what Davidson Connect is on a davidson.edu page, with the date it was checked", () => {
    expect(new URL(DAVIDSON_CONNECT.sourceUrl).hostname).toBe("www.davidson.edu");
    expect(DAVIDSON_CONNECT.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
