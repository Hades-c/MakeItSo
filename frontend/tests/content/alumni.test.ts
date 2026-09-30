import { describe, expect, it } from "vitest";
import { isLinkedInUrl } from "@/lib/types/content";
import {
  ALUMNI,
  ALUMNI_CHECKED_AT,
  alumniDirectory,
  alumniForCareer,
  contactableAlumni,
  EXCLUDED_PENDING_OWNER,
  getAlumnus,
  notableAlumni,
} from "@/server/content/alumni";
import { CAREER_SLUGS } from "@/server/content/careers";

function person(id: string) {
  const found = getAlumnus(id);
  if (!found) throw new Error(`missing alumnus ${id}`);
  return found;
}

describe("alumni", () => {
  it("keeps the 27 verified people, none excluded", () => {
    expect(ALUMNI).toHaveLength(27);
    expect(new Set(ALUMNI.map((a) => a.id)).size).toBe(27);
    expect(EXCLUDED_PENDING_OWNER).toHaveLength(6);
    const listed = new Set(ALUMNI.map((a) => a.name));
    // Removed outright under the owner rule (no LinkedIn / low-confidence LinkedIn / likely fabricated).
    for (const name of [
      "Cate Rhoades",
      "TJ Elliott",
      "Patricia Cornwell",
      "Randolph Lewis",
      "Bertis Downs IV",
    ]) {
      expect(listed.has(name)).toBe(false);
    }
    // The pending list carries a reason but no location, employer or other personal detail.
    for (const entry of EXCLUDED_PENDING_OWNER) {
      expect(Object.keys(entry).sort()).toEqual(["name", "reason"]);
      expect(entry.reason).toMatch(/^Medium-confidence LinkedIn match/);
    }
  });

  it("nulls every field whose only evidence is LinkedIn ('see LinkedIn')", () => {
    expect(person("sophie-eldridge")).toMatchObject({
      classYear: 2023,
      majors: null,
      role: null,
      organization: null,
      roleAsOf: null,
    });
    expect(person("samuel-waithira")).toMatchObject({ majors: ["Economics"], role: null });
    expect(person("grant-hearne").majors).toBeNull();
    expect(person("louise-dickinson")).toMatchObject({ majors: null, organization: null });
    expect(person("tomas-quintero")).toMatchObject({ majors: null, role: null });
    // Current title only on LinkedIn; the Board page confirms the employer.
    expect(person("steve-shames")).toMatchObject({ role: null, organization: "Publicis Groupe" });
    // The State Bar record gives the office, not the title.
    expect(person("emily-palmer")).toMatchObject({
      role: null,
      organization: "Los Angeles County District Attorney's Office",
    });
    expect(person("sebastian-charmot")).toMatchObject({ role: null, organization: null });
    expect(person("ross-kruse")).toMatchObject({ role: null, organization: null });
    expect(person("mills-jordan")).toMatchObject({ role: null, organization: null });
    expect(person("anmar-jerjees")).toMatchObject({ role: null, organization: null });
    expect(person("bruno-mourao")).toMatchObject({ role: null, organization: null });
  });

  it("shows fields a first-party page states", () => {
    expect(person("rahael-borchers")).toMatchObject({
      role: "Clinical Fellow, Medicine; National Clinician Scholar",
      fieldSources: { role: ["https://profiles.ucsf.edu/rahael.borchers"] },
    });
    expect(person("neil-patel")).toMatchObject({
      role: "Software Engineer",
      organization: "Qualtrics",
      majors: ["Computer Science"],
    });
    expect(person("stephen-p-macmillan").roleAsOf).toBe("2026-04-07");
    expect(person("ford-higgins")).toMatchObject({
      organization: "Signifyd",
      roleAsOf: "2026-09-30",
    });
  });

  it("groups by career only where a non-LinkedIn source supports it", () => {
    for (const id of [
      "sophie-eldridge",
      "samuel-waithira",
      "max-shackelford",
      "grant-hearne",
      "louise-dickinson",
      "anmar-jerjees",
      "tomas-quintero",
    ]) {
      expect([id, person(id).careerPathSlugs]).toEqual([id, []]);
    }
    expect(person("stephen-curry").careerPathSlugs).toEqual(["sports-management"]);
    for (const alumnus of ALUMNI) {
      for (const slug of alumnus.careerPathSlugs) expect(CAREER_SLUGS).toContain(slug);
    }
  });

  it("marks public figures, trustees and college officers not contactable", () => {
    expect(
      notableAlumni()
        .map((a) => a.id)
        .sort(),
    ).toEqual([
      "clint-smith",
      "sallie-permar",
      "sarah-phillips",
      "stephen-curry",
      "stephen-p-macmillan",
      "steve-shames",
      "thomas-marshburn",
      "tim-saintsing",
    ]);
    expect(contactableAlumni()).toHaveLength(19);
    expect(contactableAlumni().every((a) => a.contactable)).toBe(true);
  });

  it("stores only the allowed fields, with a hand-entered LinkedIn URL", () => {
    for (const alumnus of ALUMNI) {
      expect(Object.keys(alumnus).sort()).toEqual([
        "careerPathSlugs",
        "classYear",
        "contactable",
        "fieldSources",
        "id",
        "linkedinUrl",
        "majors",
        "name",
        "organization",
        "role",
        "roleAsOf",
        "sources",
        "verifiedAt",
      ]);
      expect(isLinkedInUrl(alumnus.linkedinUrl)).toBe(true);
      expect(alumnus.sources.filter(isLinkedInUrl)).toEqual([alumnus.linkedinUrl]);
    }
    expect(ALUMNI_CHECKED_AT).toBe("2026-09-30");
  });

  it("orders the directory and career lists newest class first", () => {
    const directory = alumniDirectory();
    for (let i = 1; i < directory.length; i++) {
      expect((directory[i - 1]!.classYear ?? 0) >= (directory[i]!.classYear ?? 0)).toBe(true);
    }
    expect(alumniForCareer("medicine").map((a) => a.id)).toEqual([
      "bruno-mourao",
      "rahael-borchers",
      "sallie-permar",
      "thomas-marshburn",
    ]);
    expect(alumniForCareer("data-science").map((a) => a.id)).toEqual([
      "sebastian-charmot",
      "ross-kruse",
      "ford-higgins",
    ]);
    expect(alumniForCareer("no-such-career")).toEqual([]);
    expect(getAlumnus("nobody")).toBeUndefined();
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ALUMNI)).toBe(true);
    expect(Object.isFrozen(person("neil-patel").fieldSources)).toBe(true);
    expect(() => {
      (person("neil-patel") as { contactable: boolean }).contactable = false;
    }).toThrow(TypeError);
  });
});
