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
  restsOnLinkedIn,
  StrictAlumnusSchema,
} from "@/server/content/alumni";
import { CAREER_SLUGS } from "@/server/content/careers";

function person(id: string) {
  const found = getAlumnus(id);
  if (!found) throw new Error(`missing alumnus ${id}`);
  return found;
}

describe("alumni", () => {
  it("keeps 26 of the verifier's 27 and holds 7 people for the owner", () => {
    expect(ALUMNI).toHaveLength(26);
    expect(new Set(ALUMNI.map((a) => a.id)).size).toBe(26);
    expect(EXCLUDED_PENDING_OWNER).toHaveLength(7);
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
      expect(entry.reason).toMatch(
        /^(Medium-confidence LinkedIn match|LinkedIn URL unconfirmed): /,
      );
      expect(listed.has(entry.name)).toBe(false);
    }
  });

  it("holds back a person whose canonical LinkedIn URL is unconfirmed (the Sarah Duncan precedent)", () => {
    expect(getAlumnus("sophie-eldridge")).toBeUndefined();
    expect(EXCLUDED_PENDING_OWNER.find((e) => e.name === "Sophie Eldridge")?.reason).toBe(
      "LinkedIn URL unconfirmed: two candidate profiles, and the canonical one is unconfirmed.",
    );
    expect(EXCLUDED_PENDING_OWNER.find((e) => e.name === "Sarah Duncan")?.reason).toMatch(
      /two candidate profiles/,
    );
  });

  it("nulls every field whose only evidence is LinkedIn ('see LinkedIn')", () => {
    expect(person("max-shackelford")).toMatchObject({
      classYear: 2025,
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
    // Dated by his Now page's "November 2024 Update", the only dated evidence (the About page has no date).
    expect(person("ford-higgins")).toMatchObject({
      role: "Data Analyst",
      organization: "Signifyd",
      roleAsOf: "2024-11-01",
    });
  });

  it("cites for each major a page that states it", () => {
    const charmot = person("sebastian-charmot");
    expect(charmot.majors).toEqual(["Mathematics", "Computer Science"]);
    // His own post names both majors; the Math & CS honors page gives him the award for a senior Mathematics
    // major. His GitHub profile states no major, so it is not a major source.
    expect(charmot.fieldSources.majors).toEqual([
      "https://medium.com/@sebastian.charmot/making-the-most-of-studying-computer-science-at-a-small-liberal-arts-college-9b9077f7d6e7",
      "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/honors-and-awards",
    ]);
    for (const alumnus of ALUMNI) {
      expect(alumnus.fieldSources.majors ?? []).not.toContain(
        "https://github.com/SebastianCharmot",
      );
    }
  });

  it("groups by career only where a non-LinkedIn source supports it", () => {
    for (const id of [
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
    expect(contactableAlumni()).toHaveLength(18);
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

  it("treats archived, cached and proxied LinkedIn pages as LinkedIn", () => {
    for (const url of [
      "https://www.linkedin.com/in/grant-hearne-6535b6198/",
      "https://linkedin.com/in/x",
      "https://web.archive.org/web/2026/https://www.linkedin.com/in/grant-hearne-6535b6198/",
      "https://webcache.googleusercontent.com/search?q=cache:linkedin.com/in/grant-hearne-6535b6198",
      "https://archive.ph/https%3A%2F%2Fwww.linkedin.com%2Fin%2Fgrant-hearne-6535b6198%2F",
      "https://lnkd.in/abc123",
    ]) {
      expect([url, restsOnLinkedIn(url)]).toEqual([url, true]);
    }
    for (const url of [
      "https://www.davidson.edu/media/9498/download",
      "https://web.archive.org/web/20240907210809/https://wildcat-career-news.davidson.edu/alumni-and-networking/how-my-experience-at-davidson-college-helped-get-me-through-law-school/",
      "https://archive.ph/%E0%A4%A", // a malformed escape is read as raw text, not thrown
    ]) {
      expect([url, restsOnLinkedIn(url)]).toEqual([url, false]);
    }
  });

  it("rejects, at load, a field or attendance that rests on a LinkedIn copy", () => {
    const hearne = structuredClone(person("grant-hearne"));
    expect(StrictAlumnusSchema.safeParse(hearne).success).toBe(true);
    const archived =
      "https://web.archive.org/web/2026/https://www.linkedin.com/in/grant-hearne-6535b6198/";
    // A LinkedIn-only role shown through an archive copy.
    const role = {
      ...hearne,
      role: "Strategy Analyst",
      organization: "Deloitte Consulting",
      roleAsOf: "2026-09-30",
      sources: [...hearne.sources, archived],
      fieldSources: { ...hearne.fieldSources, role: [archived], organization: [archived] },
    };
    expect(StrictAlumnusSchema.safeParse(role).success).toBe(false);
    // Attendance and class year resting on a search-cache copy of the profile alone.
    const cached =
      "https://webcache.googleusercontent.com/search?q=cache:linkedin.com/in/grant-hearne-6535b6198";
    const attendance = {
      ...hearne,
      sources: [cached, hearne.linkedinUrl],
      fieldSources: { classYear: [cached] },
    };
    expect(StrictAlumnusSchema.safeParse(attendance).success).toBe(false);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ALUMNI)).toBe(true);
    expect(Object.isFrozen(person("neil-patel").fieldSources)).toBe(true);
    expect(() => {
      (person("neil-patel") as { contactable: boolean }).contactable = false;
    }).toThrow(TypeError);
  });
});
