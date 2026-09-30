import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALUMNUS_SOURCED_FIELDS,
  AlumnusSchema,
  CalendarEventSchema,
  CareerSchema,
  HandshakeConfigSchema,
  isLinkedInUrl,
  OfficeSchema,
  PortalLinkSchema,
  programSourceForOffice,
  ProgramSchema,
} from "@/lib/types/content";
import { now } from "@/server/clock";
import * as content from "@/server/content";
import { ACADEMIC_CALENDAR } from "@/server/content/academic-calendar";
import { ALUMNI, EXCLUDED_PENDING_OWNER } from "@/server/content/alumni";
import { CAREERS } from "@/server/content/careers";
import { HANDSHAKE, PORTAL_LINKS } from "@/server/content/links";
import { OFFICES, PROGRAMS } from "@/server/content/offices";
import { GRADUATION_RULES } from "@/server/content/requirements";

/**
 * CI gate for curated content (PLAN §6.1 W4b). Reads only checked-in files: the course-schedule fixtures and the
 * content modules. Nothing here touches the network or a database.
 *   (a) every course code in server/content exists in some fixture term;
 *   (b) alumni follow PLAN §1 (LinkedIn URL form, a non-LinkedIn source for every shown field, checked within 12
 *       months of FIXTURES_NOW, no bio/location);
 *   (c) every salary, program, calendar, office and link entry has a source URL and verifiedAt;
 *   (d) no "best professor", difficulty or rating fields anywhere.
 */

const COURSE_FIXTURES = new URL("fixtures/external/course-schedule/", import.meta.url);

interface UpstreamSection {
  subject: { code: string };
  course_number: string;
}

const fixtureCodes = new Set<string>();
const fixtureSubjects = new Set<string>();
for (const file of readdirSync(COURSE_FIXTURES).filter((f) => /^courses-\d{6}\.json$/.test(f))) {
  const sections = JSON.parse(
    readFileSync(new URL(file, COURSE_FIXTURES), "utf8"),
  ) as UpstreamSection[];
  for (const section of sections) {
    fixtureCodes.add(`${section.subject.code} ${section.course_number}`);
    fixtureSubjects.add(section.subject.code);
  }
}
for (const file of ["filters-202601.json", "filters-202602.json"]) {
  const filters = JSON.parse(readFileSync(new URL(file, COURSE_FIXTURES), "utf8")) as {
    departments: { code: string }[];
  };
  for (const department of filters.departments) fixtureSubjects.add(department.code);
}

/** Every exported content value (lists, records, rule objects), keyed by export name. */
const EXPORTED_DATA = Object.entries(content).filter(([, value]) => typeof value !== "function");

/** Every string in a value, with its path. */
function* strings(value: unknown, path: string): Generator<[path: string, text: string]> {
  if (typeof value === "string") {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) yield* strings(item, `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) yield* strings(item, `${path}.${key}`);
  }
}

/** Every object key in a value, with its path. */
function* keys(value: unknown, path: string): Generator<[path: string, key: string]> {
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) yield* keys(item, `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      yield [path, key];
      yield* keys(item, `${path}.${key}`);
    }
  }
}

/**
 * Real courses that texts quote (official prerequisite wording, an office's program name) whose sections are in
 * the live course API but not in the fixture subsets. Each is listed with the live section that proves it; remove
 * an entry once the fixtures carry that term's section (W4b contractRequest).
 */
const QUOTED_OUTSIDE_FIXTURES: Readonly<Record<string, string>> = {
  "CSC 353": "Database Systems, 202502 CRN 20142 (quoted in a data-science prerequisite)",
  "ENV 201":
    "Environmental Science +Lab, 202501 CRN 10208 / 202502 CRN 20219 (quoted prerequisite)",
  "XPL 099": "Internship, 202501 CRN 10684 / 202502 CRN 20634 (Matthews Center program name)",
};

const COURSE_CODE_IN_TEXT = /\b([A-Z]{2,4}) (\d{3}[A-Z]?)\b/g;

describe("(a) course codes exist in the fixture catalog", () => {
  it("reads real fixture terms", () => {
    expect(fixtureCodes.size).toBeGreaterThan(500);
    expect(fixtureCodes.has("CSC 221")).toBe(true);
  });

  it("every structured course code (career courses, writing courses) is in some fixture term", () => {
    const structured = [
      ...CAREERS.flatMap((career) =>
        career.courses.map((course) => [`${career.slug}`, course.code] as const),
      ),
      ...Object.values(GRADUATION_RULES).flatMap((rules) =>
        rules.writing.courses.map((code) => [`requirements ${rules.catalogYear}`, code] as const),
      ),
    ];
    expect(structured.length).toBeGreaterThan(180);
    const missing = structured.filter(([, code]) => !fixtureCodes.has(code));
    expect(missing).toEqual([]);
  });

  it("every course code quoted in any content text is in some fixture term", () => {
    const missing: string[] = [];
    let quoted = 0;
    for (const [name, value] of EXPORTED_DATA) {
      for (const [path, text] of strings(value, name)) {
        for (const match of text.matchAll(COURSE_CODE_IN_TEXT)) {
          const [code, subject] = [`${match[1]} ${match[2]}`, match[1]!];
          // "VAC 212" (a room) and similar tokens are not course subjects.
          if (!fixtureSubjects.has(subject)) continue;
          quoted++;
          if (!fixtureCodes.has(code) && !(code in QUOTED_OUTSIDE_FIXTURES)) {
            missing.push(`${code} at ${path}`);
          }
        }
      }
    }
    expect(quoted).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });

  it("keeps the quoted-outside-fixtures list minimal", () => {
    for (const code of Object.keys(QUOTED_OUTSIDE_FIXTURES)) {
      expect([code, fixtureCodes.has(code)]).toEqual([code, false]);
    }
  });
});

describe("(b) alumni follow the PLAN §1 rules", () => {
  const LINKEDIN = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?$/;
  const today = now();
  const oneYearBefore = new Date(today);
  oneYearBefore.setUTCFullYear(oneYearBefore.getUTCFullYear() - 1);
  const floor = oneYearBefore.toISOString().slice(0, 10);
  const ceiling = today.toISOString().slice(0, 10);

  it("is pinned to the fixtures' day", () => {
    expect(ceiling).toBe("2026-09-30");
  });

  it.each(ALUMNI.map((a) => [a.id, a] as const))("%s", (_id, alumnus) => {
    expect(AlumnusSchema.parse(alumnus)).toEqual(alumnus);
    expect(alumnus.linkedinUrl).toMatch(LINKEDIN);
    // At least one non-LinkedIn source overall (Davidson attendance) ...
    expect(alumnus.sources.some((url) => !isLinkedInUrl(url))).toBe(true);
    // ... and for every shown field; the LinkedIn URL is never a field source.
    for (const field of ALUMNUS_SOURCED_FIELDS) {
      const urls = alumnus.fieldSources[field] ?? [];
      if (alumnus[field] !== null) expect(urls.some((url) => !isLinkedInUrl(url))).toBe(true);
      for (const url of urls) {
        expect(isLinkedInUrl(url)).toBe(false);
        expect(alumnus.sources).toContain(url);
      }
    }
    expect(alumnus.sources).toContain(alumnus.linkedinUrl);
    expect(alumnus.verifiedAt >= floor && alumnus.verifiedAt <= ceiling).toBe(true);
    if (alumnus.roleAsOf !== null) expect(alumnus.roleAsOf <= ceiling).toBe(true);
    const fields = Object.keys(alumnus);
    for (const banned of ["bio", "location", "notes", "industry", "minors", "email", "phone"]) {
      expect(fields).not.toContain(banned);
    }
  });

  it("keeps the six medium-confidence matches out", () => {
    const names = new Set(ALUMNI.map((a) => a.name));
    expect(EXCLUDED_PENDING_OWNER.map((e) => e.name)).toEqual([
      "Jay Hurt",
      "Lily Korir",
      "Sarah Duncan",
      "Isabelle Saba",
      "Anthony Foxx",
      "Roger H. Brown",
    ]);
    for (const { name } of EXCLUDED_PENDING_OWNER) expect(names.has(name)).toBe(false);
  });

  it("never lists public figures, trustees or college officers as contactable", () => {
    const notable = ALUMNI.filter((a) => !a.contactable).map((a) => a.name);
    for (const name of [
      "Stephen Curry",
      "Thomas Marshburn",
      "Steve Shames",
      "Sarah Phillips",
      "Stephen P. MacMillan",
      "Clint Smith",
      "Sallie Permar",
      "Tim Saintsing",
    ]) {
      expect(notable).toContain(name);
    }
  });
});

describe("(c) every curated entry has a source URL and verifiedAt", () => {
  const ceiling = now().toISOString().slice(0, 10);

  function sourced(entry: { sources: readonly string[]; verifiedAt: string }) {
    expect(entry.sources.length).toBeGreaterThan(0);
    for (const url of entry.sources) expect(url).toMatch(/^https:\/\//);
    expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.verifiedAt <= ceiling).toBe(true);
  }

  it("careers, with BLS pay carrying its own URL and period", () => {
    expect(CAREERS).toHaveLength(24);
    for (const career of CAREERS) {
      expect(CareerSchema.parse(career)).toEqual(career);
      sourced(career);
      if (career.pay) {
        expect(career.pay.url).toMatch(/^https:\/\/www\.bls\.gov\/ooh\//);
        expect(career.pay.period).toMatch(/^[A-Z][a-z]+ \d{4}$/);
        expect(career.sources).toContain(career.pay.url);
      }
    }
  });

  it("programs, with the office's truthful source tag", () => {
    expect(PROGRAMS).toHaveLength(122);
    for (const program of PROGRAMS) {
      expect(ProgramSchema.parse(program)).toEqual(program);
      sourced(program);
      expect(program.source).toBe(programSourceForOffice(program.officeSlug));
    }
  });

  it("calendar rows, offices, links and the Handshake config", () => {
    for (const row of ACADEMIC_CALENDAR) {
      expect(CalendarEventSchema.parse(row)).toEqual(row);
      sourced(row);
    }
    for (const office of OFFICES) {
      expect(OfficeSchema.parse(office)).toEqual(office);
      sourced(office);
    }
    for (const link of PORTAL_LINKS) {
      expect(PortalLinkSchema.parse(link)).toEqual(link);
      sourced(link);
    }
    expect(HandshakeConfigSchema.parse(HANDSHAKE)).toEqual(HANDSHAKE);
    sourced(HANDSHAKE);
    for (const rules of Object.values(GRADUATION_RULES)) sourced(rules);
  });

  it("decodes HTML entities everywhere", () => {
    const entity = /&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/;
    const encoded: string[] = [];
    for (const [name, value] of EXPORTED_DATA) {
      for (const [path, text] of strings(value, name)) if (entity.test(text)) encoded.push(path);
    }
    expect(encoded).toEqual([]);
  });
});

describe("(d) no invented ratings", () => {
  it("has no bestProfessor, difficulty or rating fields anywhere", () => {
    const banned =
      /^(best.?professors?|professors?|instructors?|difficulty|ratings?|rmp.*|avg.?rating|workload)$/i;
    const found: string[] = [];
    for (const [name, value] of EXPORTED_DATA) {
      for (const [path, key] of keys(value, name))
        if (banned.test(key)) found.push(`${path}.${key}`);
    }
    expect(found).toEqual([]);
  });
});
