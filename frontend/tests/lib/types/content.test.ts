import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceTag } from "@/lib/sources";
import {
  AlumnusSchema,
  CalendarEventSchema,
  CareerSchema,
  isLinkedInUrl,
  PortalLinkSchema,
  programSourceForOffice,
  ProgramSchema,
  type Alumnus,
} from "@/lib/types/content";

/** content-prep/final_offices.json (verified 2026-09-30), reduced to what a Program needs besides its text. */
interface OfficeProgramIndex {
  verifiedAt: string;
  officeCount: number;
  programs: {
    officeSlug: string;
    officeName: string;
    name: string;
    url: string;
    sourceUrl: string;
    amount: string | null;
    hasDeadline: boolean;
  }[];
}
const officePrograms = JSON.parse(
  readFileSync(new URL("../../fixtures/content/office-programs.json", import.meta.url), "utf8"),
) as OfficeProgramIndex;

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
}

/** Shaped like content-prep/final_alumni.json after the PLAN §1 rules (role/organization LinkedIn-only → null). */
const alumnus: Alumnus = {
  id: "sophie-eldridge",
  name: "Sophie Eldridge",
  classYear: 2023,
  majors: null,
  role: null,
  organization: null,
  roleAsOf: null,
  linkedinUrl: "https://www.linkedin.com/in/sophie-eldridge/",
  careerPathSlugs: ["management-consulting"],
  contactable: true,
  sources: [
    "https://www.davidson.edu/media/9498/download",
    "https://www.linkedin.com/in/sophie-eldridge/",
  ],
  fieldSources: { classYear: ["https://www.davidson.edu/media/9498/download"] },
  verifiedAt: "2026-09-30",
};

describe("content types (PLAN §4.1.6)", () => {
  it("accepts an alumnus whose LinkedIn-only fields are null", () => {
    expect(AlumnusSchema.parse(alumnus)).toEqual(alumnus);
  });

  it("never stores location, bio or notes", () => {
    for (const extra of [{ location: "Charlotte, NC" }, { bio: "..." }, { notes: "..." }]) {
      expect(AlumnusSchema.safeParse({ ...alumnus, ...extra }).success).toBe(false);
    }
  });

  it("needs a non-LinkedIn source for every displayed field", () => {
    const shown = { ...alumnus, role: "Business Analyst", roleAsOf: "2026-09-30" };
    const onlyLinkedIn = {
      ...shown,
      fieldSources: {
        ...shown.fieldSources,
        role: ["https://www.linkedin.com/in/sophie-eldridge/"],
      },
    };
    const result = AlumnusSchema.safeParse(onlyLinkedIn);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["fieldSources", "role"]);

    const sourced = {
      ...shown,
      fieldSources: { ...shown.fieldSources, role: ["https://www.davidson.edu/news/2025/example"] },
    };
    expect(AlumnusSchema.safeParse(sourced).success).toBe(true);
    expect(AlumnusSchema.safeParse({ ...sourced, roleAsOf: null }).success).toBe(false);
  });

  it("requires a Davidson-side source and a hand-entered linkedin.com/in URL", () => {
    expect(
      AlumnusSchema.safeParse({ ...alumnus, sources: [alumnus.linkedinUrl], fieldSources: {} })
        .success,
    ).toBe(false);
    for (const url of [
      "https://linkedin.com/in/sophie-eldridge/",
      "https://www.linkedin.com/in/sophie-eldridge",
      "http://www.linkedin.com/in/sophie-eldridge/",
    ]) {
      expect(AlumnusSchema.safeParse({ ...alumnus, linkedinUrl: url }).success).toBe(false);
    }
    expect(isLinkedInUrl("https://ca.linkedin.com/in/x/")).toBe(true);
    expect(isLinkedInUrl("https://www.davidson.edu/")).toBe(false);
  });

  it("treats the lnkd.in shortener and archived, cached or proxied LinkedIn copies as LinkedIn", () => {
    for (const url of [
      "https://lnkd.in/abc123",
      "https://web.archive.org/web/2026/https://www.linkedin.com/in/sophie-eldridge/",
      "https://webcache.googleusercontent.com/search?q=cache:linkedin.com/in/sophie-eldridge",
      "https://archive.ph/https%3A%2F%2Fwww.linkedin.com%2Fin%2Fsophie-eldridge%2F",
      "https://proxy.example/?u=https%3A%2F%2FLNKD.IN%2Fx",
    ]) {
      expect([url, isLinkedInUrl(url)]).toEqual([url, true]);
    }
    for (const url of [
      "https://www.davidson.edu/media/9498/download",
      "https://archive.ph/%E0%A4%A", // a malformed escape is read as raw text, never thrown
      "https://thelinkedinfluencer.example/",
    ]) {
      expect([url, isLinkedInUrl(url)]).toEqual([url, false]);
    }
    // So AlumnusSchema refuses a shown field that rests on a LinkedIn copy, for every consumer.
    const archived =
      "https://web.archive.org/web/2026/https://www.linkedin.com/in/sophie-eldridge/";
    const viaArchive = {
      ...alumnus,
      role: "Business Analyst",
      roleAsOf: "2026-09-30",
      sources: [...alumnus.sources, archived],
      fieldSources: { ...alumnus.fieldSources, role: [archived] },
    };
    expect(AlumnusSchema.safeParse(viaArchive).success).toBe(false);
    const attendance = { ...alumnus, sources: [archived, alumnus.linkedinUrl], fieldSources: {} };
    expect(AlumnusSchema.safeParse({ ...attendance, classYear: null }).success).toBe(false);
  });

  it("fits a verified career record", () => {
    const career = CareerSchema.parse({
      slug: "software-engineering",
      name: "Software Engineering",
      cluster: "Technology",
      summary: "Software engineers design, build, test, and maintain programs.",
      whatYouDo: ["Analyze what users need"],
      departments: [{ code: "CSC", name: "Computer Science" }],
      relatedPrograms: [{ name: "Computer Science", acalogId: 172, type: "major" }],
      courses: [{ code: "CSC 121", title: "Programming & Problem Solving", why: "Foundations." }],
      pay: {
        occupation: "Software developers",
        medianAnnual: 135980,
        period: "May 2025",
        projectedGrowth: "10% (2025-35), much faster than average",
        url: "https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm",
      },
      davidsonResources: [],
      externalResources: [],
      handshakeQuery: "software engineer",
      sources: [
        "https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm",
      ],
      verifiedAt: "2026-09-30",
    });
    expect(career.courses[0]?.code).toBe("CSC 121");
    expect(CareerSchema.safeParse({ ...career, bestProfessor: "Dr. X" }).success).toBe(false);
    expect(CareerSchema.safeParse({ ...career, sources: [] }).success).toBe(false);
  });

  it("fits calendar events, programs and portal links", () => {
    expect(
      CalendarEventSchema.parse({
        id: "s27-webtree-opens",
        title: "WebTree opens",
        category: "registration",
        start: "2026-10-12",
        end: null,
        time: "07:00",
        termCode: "202602",
        audience: null,
        description: "WebTree preferences open at 7 a.m.",
        sources: [
          "https://www.davidson.edu/offices-and-services/registrar/academic-calendars/2026-2027",
        ],
        verifiedAt: "2026-09-30",
      }).time,
    ).toBe("07:00");
    expect(
      ProgramSchema.parse({
        slug: "summer-internship-grants",
        officeSlug: "matthews-center",
        name: "Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description: "Grants for unpaid or low-paying summer internships.",
        amount: "$1,000 -$6,000",
        deadlineText: "March 1 - Application deadline #1",
        deadlines: [{ label: "Application deadline #1", date: "2027-03-01" }],
        audience: null,
        source: "matthews-center",
        sources: [
          "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        ],
        verifiedAt: "2026-09-30",
      }).deadlines,
    ).toHaveLength(1);
    const link = {
      slug: "handshake",
      name: "Handshake",
      url: "https://davidson.joinhandshake.com/",
      description: "Jobs and internships.",
      requiresLogin: true,
      category: "career",
      source: "handshake",
      sources: ["https://www.davidson.edu/offices-and-services/matthews-center-career-development"],
      verifiedAt: "2026-09-30",
    };
    expect(PortalLinkSchema.parse(link).source).toBe("handshake");
    expect(
      PortalLinkSchema.safeParse({ ...link, url: "http://davidson.joinhandshake.com/" }).success,
    ).toBe(false);
  });

  it("tags every one of the 122 verified office programs truthfully", () => {
    const { programs } = officePrograms;
    expect(programs).toHaveLength(122);
    const tags = new Map<string, Set<string>>();
    for (const entry of programs) {
      const source = programSourceForOffice(entry.officeSlug);
      const program = ProgramSchema.parse({
        slug: slugify(entry.name),
        officeSlug: entry.officeSlug,
        name: entry.name,
        url: entry.url,
        description: "",
        amount: entry.amount,
        deadlineText: entry.hasDeadline ? "(verbatim deadline text)" : null,
        deadlines: [],
        audience: null,
        source,
        sources: [entry.sourceUrl],
        verifiedAt: officePrograms.verifiedAt,
      });
      const officeTags = tags.get(entry.officeSlug) ?? new Set<string>();
      officeTags.add(sourceTag(program.source));
      tags.set(entry.officeSlug, officeTags);
    }
    // One tag per office, and an office-specific tag only on that office's own programs.
    for (const [office, officeTags] of tags) {
      expect([office, officeTags.size]).toEqual([office, 1]);
    }
    expect([...tags.get("matthews-center")!]).toEqual(["MATTHEWS CENTER"]);
    expect([...tags.get("hurt-hub")!]).toEqual(["HURT HUB PROGRAMS"]);
    expect([...tags.get("office-of-fellowships")!]).toEqual(["DAVIDSON OFFICES"]);
    const byTag = (tag: string) =>
      programs.filter((p) => sourceTag(programSourceForOffice(p.officeSlug)) === tag).length;
    // The law school fair and fee grant are the Matthews Center's (listed on Prelaw Advising's pages).
    expect(byTag("MATTHEWS CENTER")).toBe(32);
    expect(byTag("HURT HUB PROGRAMS")).toBe(12);
    expect(byTag("DAVIDSON OFFICES")).toBe(78);
    expect(programs.filter((p) => p.officeSlug === "prelaw")).toEqual([]);
  });

  it("rejects a program tagged with another office's source", () => {
    const fellowship = {
      slug: "fulbright",
      officeSlug: "office-of-fellowships",
      name: "Fulbright U.S. Student Program",
      url: "https://www.davidson.edu/offices-and-services/fellowships",
      description: "",
      amount: null,
      deadlineText: null,
      deadlines: [],
      audience: null,
      sources: ["https://www.davidson.edu/offices-and-services/fellowships"],
      verifiedAt: "2026-09-30",
    };
    expect(ProgramSchema.safeParse({ ...fellowship, source: "davidson-offices" }).success).toBe(
      true,
    );
    for (const source of ["matthews-center", "registrar", "hurt-hub-programs"]) {
      const result = ProgramSchema.safeParse({ ...fellowship, source });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["source"]);
    }
  });
});
