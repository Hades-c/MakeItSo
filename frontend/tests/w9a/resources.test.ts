import { describe, expect, it } from "vitest";
import {
  nameKey,
  namesProgram,
  normalizeUrl,
  officeForUrl,
  resolveResources,
  UNTAGGED_EXEMPTIONS,
} from "@/app/(hub)/careers/_lib/resources";
import { programSourceForOffice, type Office, type Program } from "@/lib/types/content";
import { CAREERS } from "@/server/content/careers";
import { OFFICES, PROGRAMS } from "@/server/content/offices";
import { E2E_UNTAGGED_EXEMPTIONS } from "./untagged";

const BASE = "https://www.davidson.edu/offices-and-services";

function office(slug: string, url: string, name = slug): Office {
  return {
    slug,
    name,
    url,
    description: "",
    services: [],
    programSlugs: [],
    sources: [url],
    verifiedAt: "2026-09-30",
  };
}

function program(
  slug: string,
  officeSlug: string,
  url: string,
  extra: Partial<Program> = {},
): Program {
  return {
    slug,
    officeSlug,
    name: slug,
    url,
    description: "",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: null,
    source: programSourceForOffice(officeSlug),
    sources: [url],
    verifiedAt: "2026-09-30",
    ...extra,
  };
}

const OFFICES_FIXTURE = [
  office("matthews-center", `${BASE}/matthews-center-career-development`, "Matthews Center"),
  office("hurt-hub", `${BASE}/jay-hurt-hub-innovation-and-entrepreneurship`, "Hurt Hub"),
  office("civic-engagement", `${BASE}/civic-engagement`, "Mulliss Center for Civic Engagement"),
];

const PROGRAMS_FIXTURE = [
  program(
    "try-it-fund",
    "hurt-hub",
    `${BASE}/jay-hurt-hub-innovation-and-entrepreneurship/try-it`,
    {
      amount: "Up to $500",
      deadlineText: "Rolling",
    },
  ),
  program("grant-a", "matthews-center", `${BASE}/matthews-center-career-development/grants`),
  program("grant-b", "matthews-center", `${BASE}/matthews-center-career-development/grants`),
  program("fellows", "civic-engagement", `${BASE}/civic-engagement/fellows`, {
    amount: "$4,000 stipend",
  }),
  // Five programs on one page, one of them the resource's (Nonprofit Leadership Fellows on the real content).
  ...[
    "Bonner Scholars",
    "Nonprofit Leadership Fellows",
    "Summer Service",
    "Civic Fellows",
    "Nonprofit Leadership",
  ].map((name, index) =>
    program(`shared-${index}`, "civic-engagement", `${BASE}/civic-engagement/programs`, {
      name,
      amount: `$${index + 1},000`,
    }),
  ),
  // The only program of a travel-grant page is on its application page, below it (Dean Rusk Travel Grants).
  program(
    "travel-grants",
    "civic-engagement",
    `${BASE}/civic-engagement/travel-grants/application-process`,
    {
      name: "Travel Grants",
      deadlineText: "Winter Break: Applications must be submitted by October 1.",
    },
  ),
];

const resource = (url: string, name = "Resource") => ({ name, url, description: `About ${name}` });

describe("normalizeUrl", () => {
  it("ignores a trailing slash, the host's case and the hash", () => {
    expect(normalizeUrl("https://WWW.Davidson.edu/x/#top")).toBe("https://www.davidson.edu/x");
    expect(normalizeUrl("https://www.davidson.edu/x/")).toBe(
      normalizeUrl("https://www.davidson.edu/x"),
    );
    expect(normalizeUrl("https://www.davidson.edu/x?a=1")).toBe("https://www.davidson.edu/x?a=1");
  });
});

describe("officeForUrl", () => {
  it("finds the office whose site the page is on, at a path boundary", () => {
    expect(officeForUrl(`${BASE}/matthews-center-career-development`, OFFICES_FIXTURE)?.slug).toBe(
      "matthews-center",
    );
    expect(
      officeForUrl(`${BASE}/matthews-center-career-development/key-programming/`, OFFICES_FIXTURE)
        ?.slug,
    ).toBe("matthews-center");
    // "civic-engagement-archive" is not below "civic-engagement".
    expect(officeForUrl(`${BASE}/civic-engagement-archive`, OFFICES_FIXTURE)).toBeNull();
    expect(
      officeForUrl("https://www.davidson.edu/academic-departments/economics", OFFICES_FIXTURE),
    ).toBeNull();
  });

  it("prefers the longest (most specific) office URL", () => {
    const nested = [...OFFICES_FIXTURE, office("inner", `${BASE}/civic-engagement/fellows`)];
    expect(officeForUrl(`${BASE}/civic-engagement/fellows/apply`, nested)?.slug).toBe("inner");
  });
});

describe("resolveResources", () => {
  it("shows a program's amount and deadline exactly as published, with the program's tag", () => {
    const [tryIt] = resolveResources(
      [resource(`${BASE}/jay-hurt-hub-innovation-and-entrepreneurship/try-it/`, "Try It Fund")],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(tryIt).toMatchObject({
      name: "Try It Fund",
      description: "About Try It Fund",
      source: "hurt-hub-programs",
      officeName: null,
      program: { slug: "try-it-fund", amount: "Up to $500", deadlineText: "Rolling" },
    });
  });

  it("names the office next to a DAVIDSON OFFICES tag", () => {
    const [fellows] = resolveResources(
      [resource(`${BASE}/civic-engagement/fellows`)],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(fellows).toMatchObject({
      source: "davidson-offices",
      officeName: "Mulliss Center for Civic Engagement",
      program: { amount: "$4,000 stipend", deadlineText: null },
    });
  });

  it("does not pin a page several programs share on any one of them", () => {
    const [grants] = resolveResources(
      [resource(`${BASE}/matthews-center-career-development/grants`)],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(grants).toMatchObject({ source: "matthews-center", officeName: null, program: null });
  });

  it("tags an office page with its office, any other offices page DAVIDSON OFFICES, and exempts department pages", () => {
    const [center, galleries, department, elsewhere] = resolveResources(
      [
        resource(`${BASE}/matthews-center-career-development`),
        resource(`${BASE}/art-galleries`, "Van Every/Smith Galleries"),
        resource("https://www.davidson.edu/academic-departments/economics/research"),
        resource("https://example.org/somewhere"),
      ],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(center).toMatchObject({ source: "matthews-center", untagged: null, program: null });
    expect(galleries).toMatchObject({
      source: "davidson-offices",
      untagged: null,
      officeName: null,
      program: null,
    });
    expect(department).toMatchObject({
      source: null,
      untagged: "davidson-web",
      officeName: null,
      program: null,
    });
    // Not a page anyone has vetted as untagged: no exemption, so the tests below and expectAllTagged fail on it.
    expect(elsewhere).toMatchObject({ source: null, untagged: null });
  });

  it("finds the program a resource names on a page several programs share", () => {
    const [fellows] = resolveResources(
      [
        resource(
          `${BASE}/civic-engagement/programs`,
          "Nonprofit Leadership Fellows (Mulliss Center for Civic Engagement)",
        ),
      ],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    // The name also starts with another program's, "Nonprofit Leadership": two programs named, so neither is
    // picked (the page keeps only its office's tag).
    expect(fellows).toMatchObject({ source: "davidson-offices", program: null });
    const withoutPrefix = PROGRAMS_FIXTURE.filter((p) => p.name !== "Nonprofit Leadership");
    const [only] = resolveResources(
      [
        resource(
          `${BASE}/civic-engagement/programs`,
          "Nonprofit Leadership Fellows (Mulliss Center for Civic Engagement)",
        ),
      ],
      OFFICES_FIXTURE,
      withoutPrefix,
    );
    expect(only).toMatchObject({
      source: "davidson-offices",
      officeName: "Mulliss Center for Civic Engagement",
      program: { name: "Nonprofit Leadership Fellows", named: true, amount: "$2,000" },
    });
  });

  it("finds the program a resource names on a page below the resource's, with its deadline", () => {
    const [grants] = resolveResources(
      [resource(`${BASE}/civic-engagement/travel-grants`, "Travel Grants")],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(grants).toMatchObject({
      program: {
        slug: "travel-grants",
        url: `${BASE}/civic-engagement/travel-grants/application-process`,
        deadlineText: "Winter Break: Applications must be submitted by October 1.",
      },
    });
    // A page below that names another program is not it.
    const [other] = resolveResources(
      [resource(`${BASE}/civic-engagement/travel-grants`, "Research Grants")],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(other?.program).toBeNull();
  });

  it("says when the resource's own name does not name the program whose facts it shows", () => {
    const [page] = resolveResources(
      [resource(`${BASE}/civic-engagement/fellows`, "Community programs")],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(page?.program).toMatchObject({ slug: "fellows", name: "fellows", named: false });
  });

  it("on the real content: tags are the offices' own, facts are the programs' verbatim", () => {
    const programsBySlug = new Map(PROGRAMS.map((p) => [p.slug, p]));
    let programBacked = 0;
    for (const career of CAREERS) {
      const resolved = resolveResources(career.davidsonResources, OFFICES, PROGRAMS);
      expect(resolved).toHaveLength(career.davidsonResources.length);
      resolved.forEach((item, index) => {
        const original = career.davidsonResources[index]!;
        expect(item.name).toBe(original.name);
        expect(item.url).toBe(original.url);
        if (item.program) {
          programBacked++;
          const source = programsBySlug.get(item.program.slug)!;
          expect(item.source).toBe(source.source);
          expect(item.program.amount).toBe(source.amount);
          expect(item.program.deadlineText).toBe(source.deadlineText);
        } else if (item.source) {
          const owner = officeForUrl(item.url, OFFICES);
          if (owner) expect(item.source).toBe(programSourceForOffice(owner.slug));
          else {
            expect(item.source).toBe("davidson-offices");
            expect(item.url).toMatch(/^https:\/\/www\.davidson\.edu\/offices-and-services\//);
          }
        }
        if (item.source === "davidson-offices" && officeForUrl(item.url, OFFICES) !== null) {
          expect(item.officeName).toBeTruthy();
        } else if (item.source !== "davidson-offices") {
          expect(item.officeName).toBeNull();
        }
        // Tagged, or untagged for an allowed reason: never untagged without one.
        if (item.source === null) expect(UNTAGGED_EXEMPTIONS).toContain(item.untagged);
        else expect(item.untagged).toBeNull();
      });
    }
    // The join is doing real work on today's content.
    expect(programBacked).toBeGreaterThan(10);
    const entrepreneurship = resolveResources(
      CAREERS.find((c) => c.slug === "entrepreneurship")!.davidsonResources,
      OFFICES,
      PROGRAMS,
    );
    expect(entrepreneurship.some((r) => r.source === "hurt-hub-programs" && r.program)).toBe(true);
  });

  it("on the real content: every resource that names a known program shows that program's facts", () => {
    let checked = 0;
    for (const career of CAREERS) {
      const resolved = resolveResources(career.davidsonResources, OFFICES, PROGRAMS);
      resolved.forEach((item) => {
        // The programs this resource names, on its own page or on one below or above it.
        const target = normalizeUrl(item.url);
        const named = PROGRAMS.filter((program) => {
          const page = normalizeUrl(program.url);
          const related =
            page === target || page.startsWith(`${target}/`) || target.startsWith(`${page}/`);
          return related && namesProgram(item.name, program.name);
        });
        if (named.length !== 1) return;
        checked++;
        const [program] = named;
        expect(item.program?.slug, `${career.slug}: ${item.name}`).toBe(program!.slug);
        expect(item.program?.amount).toBe(program!.amount);
        expect(item.program?.deadlineText).toBe(program!.deadlineText);
      });
    }
    expect(checked).toBeGreaterThan(20);

    // The two the review found: the Dean Rusk winter deadline (tomorrow) and the Nonprofit Leadership stipend.
    const rusk = resolveResources(
      CAREERS.find((c) => c.slug === "international-development")!.davidsonResources,
      OFFICES,
      PROGRAMS,
    ).find((r) => r.name === "Dean Rusk Travel Grants");
    expect(rusk?.program?.deadlineText).toMatch(
      /^Winter Break: Applications must be submitted by October 1\./,
    );
    expect(rusk?.program?.url).toMatch(/\/dean-rusk-travel-grants\/application-process$/);
    const fellows = resolveResources(
      CAREERS.find((c) => c.slug === "nonprofit")!.davidsonResources,
      OFFICES,
      PROGRAMS,
    ).find((r) => r.name.startsWith("Nonprofit Leadership Fellows"));
    expect(fellows?.program).toMatchObject({
      name: "Nonprofit Leadership Fellows",
      amount: "$3,500 stipend + housing",
    });
  });

  it("on the real content: only department and institute pages on davidson.edu are untagged", () => {
    for (const career of CAREERS) {
      for (const item of resolveResources(career.davidsonResources, OFFICES, PROGRAMS)) {
        if (item.source !== null) continue;
        expect(item.untagged, `${career.slug}: ${item.name}`).toBe("davidson-web");
        expect(item.url).toMatch(
          /^https:\/\/www\.davidson\.edu\/(academic-departments|institute-public-good)\//,
        );
      }
    }
  });
});

describe("nameKey / namesProgram", () => {
  it("compares names without asides, case, accents or punctuation", () => {
    expect(nameKey("Nonprofit Leadership Fellows (Mulliss Center for Civic Engagement)")).toBe(
      "nonprofit leadership fellows",
    );
    expect(nameKey("Hasty/Smith Internship Grant")).toBe("hasty smith internship grant");
    expect(
      namesProgram("Summer Internship Grants", "Summer Internship Grants (common application)"),
    ).toBe(true);
    expect(
      namesProgram("Matthews Center Summer Internship Grants", "Summer Internship Grants"),
    ).toBe(true);
    expect(namesProgram("Truman Scholarships (Office of Fellowships)", "Truman Scholarship")).toBe(
      false,
    );
    // Only at a word boundary.
    expect(namesProgram("Premedical Grants", "Medical Grants")).toBe(false);
    expect(namesProgram("Anything", "(only an aside)")).toBe(false);
  });
});

describe("the e2e exemption list", () => {
  it("is the app's list", () => {
    expect([...E2E_UNTAGGED_EXEMPTIONS]).toEqual([...UNTAGGED_EXEMPTIONS]);
  });
});
