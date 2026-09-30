import { describe, expect, it } from "vitest";
import { CAREERS_BY_SLUG, careersOf } from "@/app/(hub)/alumni/_lib/careers";
import {
  ALUMNI_QUERY_MAX,
  alumniFacets,
  alumniHref,
  alumnusIndustries,
  filterAlumni,
  hasAlumniFilters,
  NO_ALUMNI_FILTERS,
  parseAlumniFilters,
  type AlumniFilters,
} from "@/app/(hub)/alumni/_lib/directory";
import { CAREER_CLUSTERS, type Alumnus } from "@/lib/types/content";
import { ALUMNI, alumniDirectory } from "@/server/content/alumni";
import { CAREER_SLUGS } from "@/server/content/careers";

/** A made-up record for rule tests (never displayed; the real list is server/content/alumni.ts). */
function person(id: string, fields: Partial<Alumnus> = {}): Alumnus {
  return {
    id,
    name: id
      .split("-")
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(" "),
    classYear: 2020,
    majors: ["Economics"],
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: `https://www.linkedin.com/in/${id}-secret-slug/`,
    careerPathSlugs: [],
    contactable: true,
    sources: ["https://www.davidson.edu/news/x"],
    fieldSources: {},
    verifiedAt: "2026-09-30",
    ...fields,
  };
}

const PEOPLE = [
  person("ada-one", {
    classYear: 2022,
    role: "Software Engineer",
    organization: "Qualtrics",
    roleAsOf: "2026-09-30",
    careerPathSlugs: ["software-engineering"],
  }),
  person("bea-two", { classYear: 2017, careerPathSlugs: ["medicine", "research-academia"] }),
  person("cy-three", { classYear: null, majors: null, careerPathSlugs: [] }),
  person("dee-four", { classYear: 2017, contactable: false, careerPathSlugs: ["law"] }),
];

const filters = (patch: Partial<AlumniFilters>): AlumniFilters => ({
  ...NO_ALUMNI_FILTERS,
  ...patch,
});
const ids = (list: readonly Alumnus[]) => list.map((a) => a.id);

describe("parseAlumniFilters", () => {
  it("reads career, year, industry and text", () => {
    expect(
      parseAlumniFilters(
        { career: "medicine", year: "2017", industry: "health", q: "  Dr.   Two " },
        CAREER_SLUGS,
      ),
    ).toEqual({ career: "medicine", year: 2017, industry: "Health", q: "Dr. Two" });
  });

  it("ignores unknown or malformed values", () => {
    expect(
      parseAlumniFilters(
        { career: "astronaut", year: "20x4", industry: "space", q: undefined },
        CAREER_SLUGS,
      ),
    ).toEqual(NO_ALUMNI_FILTERS);
    for (const year of ["1850", "2200", "17", "2017.5", " 2017", ""]) {
      expect(parseAlumniFilters({ year }, CAREER_SLUGS).year).toBeNull();
    }
    expect(parseAlumniFilters(undefined, CAREER_SLUGS)).toEqual(NO_ALUMNI_FILTERS);
    expect(parseAlumniFilters({ q: "x".repeat(300) }, CAREER_SLUGS).q).toHaveLength(
      ALUMNI_QUERY_MAX,
    );
    expect(parseAlumniFilters({ career: ["law", "medicine"] }, CAREER_SLUGS).career).toBe("law");
  });
});

describe("filterAlumni", () => {
  it("filters by career path, class year and industry (the career cluster)", () => {
    expect(ids(filterAlumni(PEOPLE, filters({ career: "medicine" }), CAREERS_BY_SLUG))).toEqual([
      "bea-two",
    ]);
    expect(ids(filterAlumni(PEOPLE, filters({ year: 2017 }), CAREERS_BY_SLUG))).toEqual([
      "bea-two",
      "dee-four",
    ]);
    expect(ids(filterAlumni(PEOPLE, filters({ industry: "Health" }), CAREERS_BY_SLUG))).toEqual([
      "bea-two",
    ]);
    expect(
      ids(filterAlumni(PEOPLE, filters({ industry: "Research & Education" }), CAREERS_BY_SLUG)),
    ).toEqual(["bea-two"]);
    expect(
      ids(
        filterAlumni(
          PEOPLE,
          filters({ year: 2017, industry: "Law & Government" }),
          CAREERS_BY_SLUG,
        ),
      ),
    ).toEqual(["dee-four"]);
  });

  it("searches the name and the shown fields only", () => {
    expect(ids(filterAlumni(PEOPLE, filters({ q: "qualtrics" }), CAREERS_BY_SLUG))).toEqual([
      "ada-one",
    ]);
    expect(ids(filterAlumni(PEOPLE, filters({ q: "software engineer" }), CAREERS_BY_SLUG))).toEqual(
      ["ada-one"],
    );
    expect(ids(filterAlumni(PEOPLE, filters({ q: "cy" }), CAREERS_BY_SLUG))).toEqual(["cy-three"]);
    // A career path's name matches its people.
    expect(ids(filterAlumni(PEOPLE, filters({ q: "medicine" }), CAREERS_BY_SLUG))).toEqual([
      "bea-two",
    ]);
    // The LinkedIn URL is never searched (and neither is anything that exists only on LinkedIn).
    expect(filterAlumni(PEOPLE, filters({ q: "secret-slug" }), CAREERS_BY_SLUG)).toEqual([]);
    expect(filterAlumni(PEOPLE, filters({ q: "linkedin" }), CAREERS_BY_SLUG)).toEqual([]);
  });

  it("keeps the directory order and returns everyone without filters", () => {
    expect(filterAlumni(PEOPLE, NO_ALUMNI_FILTERS, CAREERS_BY_SLUG)).toEqual(PEOPLE);
  });
});

describe("alumnusIndustries", () => {
  it("is the clusters of the career paths, once each", () => {
    expect(alumnusIndustries(PEOPLE[1]!, CAREERS_BY_SLUG)).toEqual([
      "Health",
      "Research & Education",
    ]);
    expect(alumnusIndustries(PEOPLE[2]!, CAREERS_BY_SLUG)).toEqual([]);
    expect(
      alumnusIndustries(
        person("x", { careerPathSlugs: ["medicine", "healthcare-administration"] }),
        CAREERS_BY_SLUG,
      ),
    ).toEqual(["Health"]);
  });
});

describe("alumniFacets", () => {
  it("offers only values someone has, with counts, in a stable order", () => {
    const facets = alumniFacets(PEOPLE, CAREERS_BY_SLUG, CAREER_CLUSTERS);
    expect(facets.years).toEqual([
      { value: 2022, label: "2022", count: 1 },
      { value: 2017, label: "2017", count: 2 },
    ]);
    expect(facets.careers.map((c) => [c.value, c.count])).toEqual([
      ["law", 1],
      ["medicine", 1],
      ["research-academia", 1],
      ["software-engineering", 1],
    ]);
    expect(facets.industries.map((i) => i.value)).toEqual([
      "Technology",
      "Health",
      "Law & Government",
      "Research & Education",
    ]);
  });

  it("counts the real directory consistently with the filters", () => {
    const all = alumniDirectory();
    const facets = alumniFacets(all, CAREERS_BY_SLUG, CAREER_CLUSTERS);
    for (const option of facets.careers) {
      expect(filterAlumni(all, filters({ career: option.value }), CAREERS_BY_SLUG)).toHaveLength(
        option.count,
      );
    }
    for (const option of facets.years) {
      expect(filterAlumni(all, filters({ year: option.value }), CAREERS_BY_SLUG)).toHaveLength(
        option.count,
      );
    }
    for (const option of facets.industries) {
      expect(filterAlumni(all, filters({ industry: option.value }), CAREERS_BY_SLUG)).toHaveLength(
        option.count,
      );
    }
  });
});

describe("careersOf", () => {
  it("names each known career path of a person", () => {
    const withPaths = ALUMNI.find((a) => a.careerPathSlugs.length > 0)!;
    expect(careersOf(withPaths).map((c) => c.slug)).toEqual(withPaths.careerPathSlugs);
    expect(careersOf(person("x", { careerPathSlugs: ["not-a-career"] }))).toEqual([]);
  });
});

describe("alumniHref / hasAlumniFilters", () => {
  it("puts every filter in the URL", () => {
    expect(alumniHref()).toBe("/alumni");
    expect(
      alumniHref(filters({ career: "law", year: 2017, industry: "Law & Government", q: " x " })),
    ).toBe("/alumni?career=law&year=2017&industry=law-and-government&q=x");
    expect(hasAlumniFilters(NO_ALUMNI_FILTERS)).toBe(false);
    expect(hasAlumniFilters(filters({ year: 2017 }))).toBe(true);
    expect(hasAlumniFilters(filters({ q: "a" }))).toBe(true);
  });

  it("round-trips through parseAlumniFilters", () => {
    const f = filters({ career: "medicine", year: 2015, industry: "Health", q: "ucsf" });
    const params = Object.fromEntries(new URLSearchParams(alumniHref(f).split("?")[1]));
    expect(parseAlumniFilters(params, CAREER_SLUGS)).toEqual(f);
  });
});
