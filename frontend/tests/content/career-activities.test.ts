import { describe, expect, it } from "vitest";
import { resolveResources, normalizeUrl } from "@/app/(hub)/careers/_lib/resources";
import {
  CareerOnCampusSchema,
  CareerSchema,
  CareerSummerSchema,
  ON_CAMPUS_HOSTS,
  SUMMER_PROGRAM_HOSTS,
  urlOnHost,
} from "@/lib/types/content";
import { CAREER_ACTIVITIES } from "@/server/content/career-activities";
import { CAREERS, getCareer } from "@/server/content/careers";
import { getProgram, OFFICES, PROGRAMS } from "@/server/content/offices";

/**
 * The careers' "On campus" and "Summers" entries (owner request, 2026-10-29): every entry sourced (an https page on
 * an allowed host and a verifiedAt), office programs named by a real slug, nothing repeated from the same page's
 * other cards, and none of the hackathon-era invented text (named faculty, "best professor" picks, made-up
 * fellowships, "top destinations").
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** No entry claims a check later than today (the real day: these dates are when a person read the page). */
const TODAY = new Date().toISOString().slice(0, 10);

const onCampus = CAREERS.flatMap((career) =>
  (career.onCampus ?? []).map((entry) => ({ slug: career.slug, entry })),
);
const summers = CAREERS.flatMap((career) =>
  (career.summer ?? []).map((entry) => ({ slug: career.slug, entry })),
);

describe("career on-campus entries", () => {
  it("are WildcatSync organization pages (or davidson.edu pages), each with its verifiedAt", () => {
    expect(onCampus.length).toBeGreaterThan(50);
    for (const { slug, entry } of onCampus) {
      expect(CareerOnCampusSchema.parse(entry), slug).toEqual(entry);
      expect(entry.url, slug).toMatch(/^https:\/\//);
      expect(urlOnHost(entry.url, ON_CAMPUS_HOSTS[entry.source]), `${slug}: ${entry.url}`).toBe(
        true,
      );
      if (entry.source === "wildcatsync") {
        expect(entry.url, slug).toMatch(
          /^https:\/\/wildcatsync\.davidson\.edu\/organization\/[A-Za-z0-9_-]+$/,
        );
      }
      expect(entry.verifiedAt, slug).toMatch(ISO_DAY);
      expect(entry.verifiedAt <= TODAY, slug).toBe(true);
    }
  });

  it("lists each organization once per path", () => {
    for (const career of CAREERS) {
      const urls = (career.onCampus ?? []).map((entry) => entry.url);
      expect(new Set(urls).size, career.slug).toBe(urls.length);
    }
  });

  it("refuses a page on another host, or under the wrong source", () => {
    const good = getCareer("software-engineering")!.onCampus![0]!;
    expect(CareerOnCampusSchema.safeParse(good).success).toBe(true);
    for (const bad of [
      { ...good, url: "https://example.com/organization/acm" },
      { ...good, url: "https://wildcatsync.davidson.edu.evil.com/organization/acm" },
      { ...good, url: "http://wildcatsync.davidson.edu/organization/acm" },
      { ...good, source: "davidson-offices" },
      { ...good, verifiedAt: "last week" },
      { ...good, officer: "A. Student" },
    ]) {
      expect(CareerOnCampusSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("career summer entries", () => {
  it("are curated office programs by slug, or outside programs on an official host with a verifiedAt", () => {
    expect(summers.length).toBeGreaterThan(40);
    for (const { slug, entry } of summers) {
      expect(CareerSummerSchema.parse(entry), slug).toEqual(entry);
      if (entry.kind === "program") {
        const program = getProgram(entry.program);
        expect(program, `${slug}: ${entry.program}`).toBeDefined();
        expect(program!.url).toMatch(/^https:\/\//);
        expect(program!.verifiedAt).toMatch(ISO_DAY);
      } else {
        expect(entry.url, slug).toMatch(/^https:\/\//);
        expect(urlOnHost(entry.url, SUMMER_PROGRAM_HOSTS), `${slug}: ${entry.url}`).toBe(true);
        expect(entry.verifiedAt, slug).toMatch(ISO_DAY);
        expect(entry.verifiedAt <= TODAY, slug).toBe(true);
      }
    }
  });

  it("refuses an outside program on an unlisted host, and unvetted fields", () => {
    const reu = getCareer("software-engineering")!.summer!.find((s) => s.kind === "outside")!;
    expect(CareerSummerSchema.safeParse(reu).success).toBe(true);
    for (const bad of [
      { ...reu, url: "https://www.makeoverarena.com/nih-summer-internship-program/" },
      { ...reu, verifiedAt: undefined },
      { ...reu, topDestinations: ["Google"] },
      { kind: "program", program: "nsf-reu", description: "x", professor: "Dr. X" },
    ]) {
      expect(CareerSummerSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("never repeats, on one path, a program its At Davidson or Beyond Davidson card already lists", () => {
    const problems: string[] = [];
    for (const career of CAREERS) {
      const resources = resolveResources(career.davidsonResources, OFFICES, PROGRAMS);
      const shownPrograms = new Set(resources.flatMap((r) => (r.program ? [r.program.slug] : [])));
      const shownUrls = new Set(
        [...career.davidsonResources, ...career.externalResources].map((r) => normalizeUrl(r.url)),
      );
      const seen = new Set<string>();
      for (const entry of career.summer ?? []) {
        const key = entry.kind === "program" ? entry.program : entry.url;
        if (seen.has(key)) problems.push(`${career.slug}: ${key} twice`);
        seen.add(key);
        if (entry.kind === "program" && shownPrograms.has(entry.program)) {
          problems.push(`${career.slug}: ${entry.program} is already under At Davidson`);
        }
        const url = entry.kind === "program" ? getProgram(entry.program)!.url : entry.url;
        if (entry.kind === "outside" && shownUrls.has(normalizeUrl(url))) {
          problems.push(`${career.slug}: ${url} is already listed`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("career activities overall", () => {
  it("name only real career paths, and every path gets at least one", () => {
    const slugs = new Set(CAREERS.map((career) => career.slug));
    for (const slug of Object.keys(CAREER_ACTIVITIES)) expect(slugs.has(slug), slug).toBe(true);
    for (const career of CAREERS) {
      expect(CareerSchema.parse(career)).toEqual(career);
      expect((career.onCampus?.length ?? 0) + (career.summer?.length ?? 0), career.slug).toBe(
        (CAREER_ACTIVITIES[career.slug]?.onCampus?.length ?? 0) +
          (CAREER_ACTIVITIES[career.slug]?.summer?.length ?? 0),
      );
      expect(career.onCampus?.length ?? 0, career.slug).toBeGreaterThan(0);
    }
  });

  it("carries none of the hackathon-era invented text", () => {
    const texts = [
      ...onCampus.map(({ entry }) => [entry.name, entry.description]),
      ...summers.map(({ entry }) =>
        entry.kind === "program"
          ? [entry.description]
          : [entry.name, entry.by, entry.description, entry.eligibility, entry.timing ?? ""],
      ),
    ].flat();
    const banned =
      /\b(prof\.|professor|dr\. [a-z]+ [a-z]+ lab|best|top destinations?|hurt hub startup fellowship|guaranteed)\b|[a-z0-9.]+@[a-z]+\.[a-z]+/i;
    expect(texts.filter((text) => banned.test(text))).toEqual([]);
  });
});
