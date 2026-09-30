import { describe, expect, it } from "vitest";
import { normalizeUrl, officeForUrl, resolveResources } from "@/app/(hub)/careers/_lib/resources";
import { programSourceForOffice, type Office, type Program } from "@/lib/types/content";
import { CAREERS } from "@/server/content/careers";
import { OFFICES, PROGRAMS } from "@/server/content/offices";

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

  it("tags an office page with its office and leaves other pages untagged", () => {
    const [center, department] = resolveResources(
      [
        resource(`${BASE}/matthews-center-career-development`),
        resource("https://www.davidson.edu/academic-departments/economics/research"),
      ],
      OFFICES_FIXTURE,
      PROGRAMS_FIXTURE,
    );
    expect(center).toMatchObject({ source: "matthews-center", program: null });
    expect(department).toMatchObject({ source: null, officeName: null, program: null });
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
          const owner = officeForUrl(item.url, OFFICES)!;
          expect(item.source).toBe(programSourceForOffice(owner.slug));
        }
        if (item.source === "davidson-offices") expect(item.officeName).toBeTruthy();
        else expect(item.officeName).toBeNull();
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
});
