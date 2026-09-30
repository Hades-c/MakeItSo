import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
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
  type Alumnus,
  type Career,
} from "@/lib/types/content";
import { now } from "@/server/clock";
import { ACADEMIC_CALENDAR } from "@/server/content/academic-calendar";
import { ALUMNI, EXCLUDED_PENDING_OWNER } from "@/server/content/alumni";
import { CAREER_SLUGS, CAREERS } from "@/server/content/careers";
import { foldText } from "@/server/content/define";
import { HANDSHAKE, HANDSHAKE_DOCUMENTED_PATHS, PORTAL_LINKS } from "@/server/content/links";
import { OFFICES, PROGRAMS } from "@/server/content/offices";
import { GRADUATION_RULES } from "@/server/content/requirements";

/**
 * CI gate for curated content (PLAN §6.1 W4b). Reads only checked-in files: the course-schedule fixtures and the
 * content modules. Nothing here touches the network or a database.
 *   (a) every course code in server/content exists in some fixture term (and every subject is a real one);
 *   (b) alumni follow PLAN §1 (LinkedIn URL form, a non-LinkedIn source for attendance and every shown field,
 *       checked within 12 months of FIXTURES_NOW, no bio/location);
 *   (c) every salary, program, calendar, office and link entry has a source URL and verifiedAt, and cites the
 *       pages its text names;
 *   (d) no "best professor", difficulty or rating fields anywhere;
 *   (e) link rules: Handshake only at its base URL or a path a Davidson page publishes; no Moodle URLs.
 * Each rule is a pure check run on the real content (no problems) and on broken copies (the problem is found).
 */

// ---- Inputs --------------------------------------------------------------------------------------------------------

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

/**
 * Every module in server/content, not only what the barrel re-exports: a new module left out of index.ts is
 * scanned too.
 */
const CONTENT_DIR = new URL("../server/content/", import.meta.url);
const MODULE_FILES = readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith(".ts"))
  .sort();
const MODULES = await Promise.all(
  MODULE_FILES.map(
    async (file) =>
      [file, (await import(fileURLToPath(new URL(file, CONTENT_DIR)))) as object] as const,
  ),
);

/**
 * Every exported content value (lists, records, rule objects) of every module, keyed "file:export". Functions and
 * zod schemas are code, not content; a value re-exported by the barrel is scanned once.
 */
const EXPORTED_DATA: [name: string, value: unknown][] = [];
{
  const seen = new Set<unknown>();
  for (const [file, module] of MODULES) {
    for (const [name, value] of Object.entries(module)) {
      if (typeof value === "function" || value instanceof z.ZodType) continue;
      if (value !== null && typeof value === "object") {
        if (seen.has(value)) continue;
        seen.add(value);
      }
      EXPORTED_DATA.push([`${file}:${name}`, value]);
    }
  }
}

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

const ALL_STRINGS = EXPORTED_DATA.flatMap(([name, value]) => [...strings(value, name)]);

// ---- (a) course codes ----------------------------------------------------------------------------------------------

/**
 * Real courses that texts quote (official prerequisite wording, an office's program name) whose sections are in
 * the live course API but not in the fixture subsets. Each is listed with the live section that proves it; remove
 * an entry once the fixtures carry that term's section (W4b contractRequest).
 */
const QUOTED_OUTSIDE_FIXTURES: Readonly<Record<string, string>> = {
  "CSC 353": "Database Systems, 202502 CRN 20142 (quoted in a data-science prerequisite)",
  "ENV 201":
    "Environmental Science +Lab, 202501 CRN 10208 / 202502 CRN 20219 (quoted prerequisite)",
  "PSY 234":
    "Child Psychopathology, 202502 CRN 20402 (quoted catalog prerequisite, 'PSY 231 or 234')",
  "XPL 099": "Internship, 202501 CRN 10684 / 202502 CRN 20634 (Matthews Center program name)",
};

/** Tokens shaped like a course code that are not courses. Anything else shaped like one is checked. */
const NOT_COURSE_CODES: Readonly<Record<string, string>> = {
  "VAC 212":
    "a room: the Visual Arts Center digital studio (careers: arts-museum-curation resources)",
};

/**
 * Course codes in a text, with the catalog's shorthands expanded: "BIO 370/371", "ECO 101, 202, and 204",
 * "PSY 231 or 234" give every code; a range "BIO 111-116" gives both ends.
 */
function codesIn(text: string): string[] {
  const codes: string[] = [];
  const pattern = /\b([A-Z]{2,4}) (\d{3}[A-Z]?)\b((?:(?:\/|-|,? (?:and|or) |, )\d{3}[A-Z]?\b)*)/g;
  for (const match of text.matchAll(pattern)) {
    const subject = match[1]!;
    codes.push(`${subject} ${match[2]!}`);
    for (const more of (match[3] ?? "").matchAll(/\d{3}[A-Z]?/g))
      codes.push(`${subject} ${more[0]}`);
  }
  return codes;
}

/** Problems with the course codes quoted in texts: unknown subjects and codes no fixture term has. */
function textCodeProblems(texts: readonly (readonly [path: string, text: string])[]): string[] {
  const problems: string[] = [];
  for (const [path, text] of texts) {
    for (const code of codesIn(text)) {
      if (code in NOT_COURSE_CODES) continue;
      const subject = code.split(" ")[0]!;
      if (!fixtureSubjects.has(subject)) problems.push(`${code} (no such subject) at ${path}`);
      else if (!fixtureCodes.has(code) && !(code in QUOTED_OUTSIDE_FIXTURES)) {
        problems.push(`${code} (in no fixture term) at ${path}`);
      }
    }
  }
  return problems;
}

/** Problems with structured subject codes: career departments and the language requirement's subjects. */
function subjectProblems(
  careers: readonly Pick<Career, "slug" | "departments">[],
  rules: readonly (typeof GRADUATION_RULES)[keyof typeof GRADUATION_RULES][],
): string[] {
  const problems: string[] = [];
  for (const career of careers) {
    for (const department of career.departments) {
      if (!fixtureSubjects.has(department.code)) {
        problems.push(`${career.slug}: department ${department.code}`);
      }
    }
  }
  for (const rule of rules) {
    const subjects = [
      ...rule.language.languages.map((l) => l.subject),
      ...rule.language.excludedSubjects.map((l) => l.subject),
    ];
    for (const subject of subjects) {
      if (!fixtureSubjects.has(subject)) problems.push(`${rule.catalogYear}: language ${subject}`);
    }
  }
  return problems;
}

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

  it("every career department and language subject is a real course subject", () => {
    expect(subjectProblems(CAREERS, Object.values(GRADUATION_RULES))).toEqual([]);
    const renamed = structuredClone(CAREERS.find((c) => c.slug === "data-science")!);
    renamed.departments[0]!.code = "BUS";
    expect(subjectProblems([renamed], [])).toEqual(["data-science: department BUS"]);
  });

  it("expands the catalog's shorthands before checking", () => {
    expect(codesIn("requires BIO 370/371")).toEqual(["BIO 370", "BIO 371"]);
    expect(codesIn("requires ECO 101, 202, and 204.")).toEqual(["ECO 101", "ECO 202", "ECO 204"]);
    expect(codesIn("PSY 231 or 234")).toEqual(["PSY 231", "PSY 234"]);
    expect(codesIn("one of BIO 111-116, CHE 115, or ENV 201")).toEqual([
      "BIO 111",
      "BIO 116",
      "CHE 115",
      "ENV 201",
    ]);
    expect(codesIn("Room 208, class of 2027, CSC 121 in 2026")).toEqual(["CSC 121"]);
  });

  it("every course code quoted in any content text is in some fixture term", () => {
    const quoted = ALL_STRINGS.flatMap(([, text]) => codesIn(text));
    expect(quoted.length).toBeGreaterThan(100);
    expect(textCodeProblems(ALL_STRINGS)).toEqual([]);
  });

  it("flags invented codes, including ones under an invented subject", () => {
    expect(
      textCodeProblems([
        ["a", "Take BUS 301 first."],
        ["b", "FAKE 999"],
        ["c", "CSC 998"],
        ["d", "BIO 370/998"],
      ]),
    ).toEqual([
      "BUS 301 (no such subject) at a",
      "FAKE 999 (no such subject) at b",
      "CSC 998 (in no fixture term) at c",
      "BIO 998 (in no fixture term) at d",
    ]);
  });

  it("keeps the exception lists minimal and in use", () => {
    const quoted = new Set(ALL_STRINGS.flatMap(([, text]) => codesIn(text)));
    for (const code of Object.keys(QUOTED_OUTSIDE_FIXTURES)) {
      expect([code, fixtureCodes.has(code), quoted.has(code)]).toEqual([code, false, true]);
    }
    for (const code of Object.keys(NOT_COURSE_CODES)) {
      expect([code, quoted.has(code)]).toEqual([code, true]);
    }
  });
});

// ---- (b) alumni ----------------------------------------------------------------------------------------------------

const LINKEDIN = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?$/;

/**
 * LinkedIn, or a copy of it (an archive snapshot, a search cache, a proxy, the lnkd.in shortener): the gate's own
 * test, stricter than lib's host-only isLinkedInUrl(), so a module can never weaken it.
 */
function fromLinkedIn(url: string): boolean {
  let text = url;
  try {
    text = decodeURIComponent(url);
  } catch {
    // keep the raw text
  }
  return isLinkedInUrl(url) || /linkedin\.com|lnkd\.in/i.test(text);
}

/** People-search aggregators re-publish LinkedIn data, so they never back a shown field or attendance. */
const AGGREGATOR_HOSTS =
  /(^|\.)(theorg\.com|zoominfo\.com|rocketreach\.co|signalhire\.com|contactout\.com|apollo\.io|lusha\.com)$/i;

function independent(url: string): boolean {
  return !fromLinkedIn(url) && !AGGREGATOR_HOSTS.test(new URL(url).hostname);
}

const BANNED_ALUMNUS_KEYS = [
  "bio",
  "location",
  "city",
  "notes",
  "industry",
  "minors",
  "email",
  "phone",
  "headline",
];

const today = now();
const ceiling = today.toISOString().slice(0, 10);
const oneYearBefore = new Date(today);
oneYearBefore.setUTCFullYear(oneYearBefore.getUTCFullYear() - 1);
const floor = oneYearBefore.toISOString().slice(0, 10);

/** Pages that list trustees and college officers: anyone they back is "Notable", never cold-emailed. */
const NOTABLE_ROSTERS = [
  "https://www.davidson.edu/about/college-leadership/board-trustees",
  "https://www.davidson.edu/about/college-leadership/senior-leadership",
];

/** Every PLAN §1 rule an alumni record breaks (empty when it follows them all). */
function alumnusViolations(alumnus: Alumnus): string[] {
  const problems: string[] = [];
  const parsed = AlumnusSchema.safeParse(alumnus);
  if (!parsed.success) problems.push(`schema: ${parsed.error.issues[0]?.message}`);
  if (!LINKEDIN.test(alumnus.linkedinUrl)) problems.push("linkedinUrl is not a /in/<slug>/ URL");
  if (!alumnus.sources.includes(alumnus.linkedinUrl)) problems.push("linkedinUrl not in sources");
  if (!alumnus.sources.some(independent)) problems.push("attendance rests on LinkedIn alone");
  for (const url of alumnus.sources) {
    if (fromLinkedIn(url) && url !== alumnus.linkedinUrl)
      problems.push(`LinkedIn copy in sources: ${url}`);
  }
  for (const field of ALUMNUS_SOURCED_FIELDS) {
    const urls = alumnus.fieldSources[field] ?? [];
    if (alumnus[field] !== null && !urls.some(independent)) {
      problems.push(`${field} shown without a non-LinkedIn source`);
    }
    if (alumnus[field] === null && urls.length > 0)
      problems.push(`${field} is null but has sources`);
    for (const url of urls) {
      if (!independent(url)) problems.push(`${field} cites LinkedIn or an aggregator: ${url}`);
      if (!alumnus.sources.includes(url)) problems.push(`${field} source not in sources: ${url}`);
    }
  }
  if (!(alumnus.verifiedAt >= floor && alumnus.verifiedAt <= ceiling)) {
    problems.push(`verifiedAt ${alumnus.verifiedAt} outside ${floor}..${ceiling}`);
  }
  if (alumnus.roleAsOf !== null && alumnus.roleAsOf > ceiling)
    problems.push("roleAsOf in the future");
  if (alumnus.role === null && alumnus.organization === null && alumnus.roleAsOf !== null) {
    problems.push("roleAsOf without a role or organization");
  }
  for (const key of Object.keys(alumnus)) {
    if (BANNED_ALUMNUS_KEYS.includes(key)) problems.push(`banned key: ${key}`);
  }
  if (alumnus.contactable && alumnus.sources.some((url) => NOTABLE_ROSTERS.includes(url))) {
    problems.push("a trustee or college officer is contactable");
  }
  for (const slug of alumnus.careerPathSlugs) {
    if (!CAREER_SLUGS.includes(slug)) problems.push(`unknown career ${slug}`);
  }
  return problems;
}

/** "Anthony R. Foxx" and "Anthony Foxx" are the same person here: first and last name, folded. */
function personKey(name: string): string {
  const words = foldText(name)
    .split(/[\s.]+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv)$/.test(w));
  return `${words[0] ?? ""} ${words.at(-1) ?? ""}`;
}

/** Removed outright under the owner rule (never stored): likely fabricated, or no usable LinkedIn match. */
const REMOVED_OUTRIGHT = [
  "Cate Rhoades",
  "TJ Elliott",
  "Patricia Cornwell",
  "Randolph Lewis",
  "Bertis Downs IV",
];

/** Problems with the directory as a whole: held or removed people listed, and the pending list's shape. */
function directoryProblems(
  alumni: readonly Pick<Alumnus, "name">[],
  pending: readonly object[],
): string[] {
  const problems: string[] = [];
  const listed = new Set(alumni.map((a) => personKey(a.name)));
  for (const entry of pending) {
    const fields = Object.keys(entry).sort();
    if (fields.join() !== "name,reason") problems.push(`pending entry keys: ${fields.join(", ")}`);
    const name = (entry as { name?: unknown }).name;
    if (typeof name === "string" && listed.has(personKey(name)))
      problems.push(`held but listed: ${name}`);
  }
  for (const name of REMOVED_OUTRIGHT) {
    if (listed.has(personKey(name))) problems.push(`removed but listed: ${name}`);
  }
  return problems;
}

describe("(b) alumni follow the PLAN §1 rules", () => {
  it("is pinned to the fixtures' day", () => {
    expect(ceiling).toBe("2026-09-30");
    expect(floor).toBe("2025-09-30");
  });

  it.each(ALUMNI.map((a) => [a.id, a] as const))("%s", (_id, alumnus) => {
    expect(alumnusViolations(alumnus)).toEqual([]);
  });

  describe("catches broken records", () => {
    const hearne = () => structuredClone(ALUMNI.find((a) => a.id === "grant-hearne")!);
    const archived =
      "https://web.archive.org/web/2026/https://www.linkedin.com/in/grant-hearne-6535b6198/";
    const cached =
      "https://webcache.googleusercontent.com/search?q=cache:linkedin.com/in/grant-hearne-6535b6198";

    it("a LinkedIn-only role shown through an archive copy", () => {
      const record = hearne();
      Object.assign(record, {
        role: "Strategy Analyst",
        organization: "Deloitte Consulting",
        roleAsOf: "2026-09-30",
        sources: [...record.sources, archived],
        fieldSources: { ...record.fieldSources, role: [archived], organization: [archived] },
      });
      expect(alumnusViolations(record)).toEqual(
        expect.arrayContaining([
          `LinkedIn copy in sources: ${archived}`,
          "role shown without a non-LinkedIn source",
          "organization shown without a non-LinkedIn source",
        ]),
      );
    });

    it("attendance resting on a search-cache copy of the profile", () => {
      const record = hearne();
      Object.assign(record, {
        sources: [cached, record.linkedinUrl],
        fieldSources: { classYear: [cached] },
      });
      expect(alumnusViolations(record)).toEqual(
        expect.arrayContaining([
          "attendance rests on LinkedIn alone",
          "classYear shown without a non-LinkedIn source",
        ]),
      );
    });

    it("an aggregator as a field source, a stale check, a location and a query-string URL", () => {
      const record = hearne() as Alumnus & { location?: string };
      const theorg = "https://theorg.com/org/deloitte/org-chart/grant-hearne";
      Object.assign(record, {
        organization: "Deloitte Consulting",
        roleAsOf: "2026-09-30",
        sources: [...record.sources, theorg],
        fieldSources: { ...record.fieldSources, organization: [theorg] },
        verifiedAt: "2025-09-29",
        location: "Charlotte, NC",
        linkedinUrl: "https://www.linkedin.com/in/grant-hearne-6535b6198/?trk=x",
      });
      const problems = alumnusViolations(record);
      expect(problems).toEqual(
        expect.arrayContaining([
          "organization shown without a non-LinkedIn source",
          `organization cites LinkedIn or an aggregator: ${theorg}`,
          "verifiedAt 2025-09-29 outside 2025-09-30..2026-09-30",
          "banned key: location",
          "linkedinUrl is not a /in/<slug>/ URL",
        ]),
      );
    });
  });

  it("keeps held and removed people out, under any spelling, and the pending list to name + reason", () => {
    expect(directoryProblems(ALUMNI, EXCLUDED_PENDING_OWNER)).toEqual([]);
    const foxx = { name: "Anthony R. Foxx" };
    const rhoades = { name: "Cate Rhoades" };
    expect(
      directoryProblems(
        [...ALUMNI, foxx, rhoades],
        [...EXCLUDED_PENDING_OWNER, { name: "Jay Hurt", reason: "x", location: "Houston, TX" }],
      ),
    ).toEqual([
      "held but listed: Anthony Foxx",
      "pending entry keys: location, name, reason",
      "removed but listed: Cate Rhoades",
    ]);
  });

  it("marks anyone the Board or senior-leadership page backs as not contactable, on real careers", () => {
    const trustee = structuredClone(ALUMNI.find((a) => a.id === "tim-saintsing")!);
    trustee.contactable = true;
    trustee.careerPathSlugs = ["educaton"];
    expect(alumnusViolations(trustee)).toEqual([
      "a trustee or college officer is contactable",
      "unknown career educaton",
    ]);
  });

  it("keeps the six medium-confidence matches out, and the others held for the owner", () => {
    const names = new Set(ALUMNI.map((a) => a.name));
    const held = EXCLUDED_PENDING_OWNER.map((e) => e.name);
    expect(held).toEqual(
      expect.arrayContaining([
        "Jay Hurt",
        "Lily Korir",
        "Sarah Duncan",
        "Isabelle Saba",
        "Anthony Foxx",
        "Roger H. Brown",
      ]),
    );
    for (const name of held) expect(names.has(name)).toBe(false);
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

// ---- (c) sources ---------------------------------------------------------------------------------------------------

/**
 * Pages that texts name, and the URL a record naming one must cite. A text that names a page (a capitalised
 * "... page", "... profile" or "... listing") must match one of these, so a new named page cannot slip through
 * without its source.
 */
const NAMED_PAGES: readonly [name: RegExp, cited: (url: string) => boolean][] = [
  [
    /Course Registration & WebTree Overview|registration overview/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/registrar/course-registration-and-webtree-overview",
  ],
  [
    /Self-Scheduled Exam Procedures/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/registrar/course-offerings/self-scheduled-exam-procedures",
  ],
  [
    /Academic Regulations(?! page)/,
    (u) =>
      u === "https://www.davidson.edu/media/15696/download?attachment" ||
      u.startsWith("https://www.davidson.edu/offices-and-services/registrar/academic-regulations"),
  ],
  [
    /catalog's Academic Regulations page/,
    (u) => u === "https://catalog.davidson.edu/content.php?catoid=28&navoid=1332",
  ],
  [
    /Residence Life/,
    (u) => u === "https://www.davidson.edu/offices-and-services/residence-life/dates-deadlines",
  ],
  [
    /\bHR's\b/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/human-resources/benefits/college-holidays",
  ],
  [
    /Registrar's (?:calendar|[A-Z][a-z]+\/[A-Z][a-z]+ Break|(?:Fall|Spring) \d{4} table)|per the academic calendar/,
    (u) =>
      u === "https://www.davidson.edu/offices-and-services/registrar/academic-calendars/2026-2027",
  ],
  [/course API|terms API/, (u) => u.startsWith("https://api.davidson.edu/")],
  [
    /Matthews Center Internships page/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships",
  ],
  [
    /Key Programming page/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming",
  ],
  [
    /roadmap page/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/student-career-planning-roadmap",
  ],
  [/WildcatSync profile/, (u) => u.startsWith("https://wildcatsync.davidson.edu/organization/")],
  [
    /WildcatSync (?:deadline )?listing/,
    (u) => u.startsWith("https://wildcatsync.davidson.edu/event/"),
  ],
  [
    /Fellowship Opportunities page/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities",
  ],
  [
    /Grants overview page/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities",
  ],
  [/Prelaw page/, (u) => u === "https://www.davidson.edu/academic-departments/prelaw"],
  [/Catalyst page/, (u) => u === "https://www.davidson.edu/catalyst"],
  [/Applied AI Lab page/, (u) => u === "https://hurthub.davidson.edu/applied-ai/"],
  [/the Students page/i, (u) => u === "https://hurthub.davidson.edu/students/"],
  // The CTL's Moodle pages are named, not linked (Moodle is out of scope, PLAN §1): the CTL page that lists them
  // is cited instead.
  [
    /Moodle page/,
    (u) =>
      u.startsWith("https://www.davidson.edu/offices-and-services/center-teaching-and-learning"),
  ],
  [
    /Student Grants page/,
    (u) =>
      u ===
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants",
  ],
];

/** "The Key Programming page", "the Office of Fellowships' WildcatSync listing", ... */
const NAMES_A_PAGE = /(?:[A-Z][\w&'./-]*\s){1,6}(?:page|profile|listing)\b/g;

/** Problems with the pages a record's texts name: named but not cited, or named but unknown to NAMED_PAGES. */
function namedPageProblems(
  id: string,
  texts: readonly string[],
  sources: readonly string[],
): string[] {
  const problems: string[] = [];
  for (const text of texts) {
    for (const [name, cited] of NAMED_PAGES) {
      if (name.test(text) && !sources.some(cited))
        problems.push(`${id} names ${name} but cites none`);
    }
    for (const match of text.matchAll(NAMES_A_PAGE)) {
      // A little context before the capitalised words ("the 2026-2027 catalog's Academic Regulations page").
      const around = text.slice(Math.max(0, match.index - 40), match.index + match[0].length);
      if (!NAMED_PAGES.some(([name]) => name.test(around))) {
        problems.push(`${id} names an unlisted page: "${match[0].trim()}"`);
      }
    }
  }
  return problems;
}

/** Wording that goes stale in frozen content ("is today", "already past"). Dates are written out instead. */
const TIME_RELATIVE =
  /\b(?:is|was) today\b|\balready (?:past|under ?way)\b|\b(?:yesterday|tomorrow)\b/i;

describe("(c) every curated entry has a source URL and verifiedAt", () => {
  function sourced(entry: { sources: readonly string[]; verifiedAt: string }) {
    expect(entry.sources.length).toBeGreaterThan(0);
    for (const url of entry.sources) expect(url).toMatch(/^https:\/\//);
    expect(new Set(entry.sources).size).toBe(entry.sources.length);
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

  it("cites every page a text names", () => {
    const problems = [
      ...ACADEMIC_CALENDAR.flatMap((row) =>
        namedPageProblems(row.id, [row.title, row.description ?? ""], row.sources),
      ),
      ...OFFICES.flatMap((office) =>
        namedPageProblems(office.slug, [office.description, ...office.services], office.sources),
      ),
      ...PROGRAMS.flatMap((program) =>
        namedPageProblems(
          program.slug,
          [program.description, program.audience ?? "", program.deadlineText ?? ""],
          program.sources,
        ),
      ),
    ];
    expect(problems).toEqual([]);
  });

  it("catches a named page that is not cited, or not known", () => {
    expect(
      namedPageProblems(
        "row",
        ["The Self-Scheduled Exam Procedures page gives the pickup windows."],
        ["https://www.davidson.edu/offices-and-services/registrar/academic-calendars/2026-2027"],
      ),
    ).toEqual(["row names /Self-Scheduled Exam Procedures/ but cites none"]);
    expect(namedPageProblems("row", ["The Study Abroad Handbook page says so."], [])).toEqual([
      'row names an unlisted page: "The Study Abroad Handbook page"',
    ]);
  });

  it("writes dates out instead of 'today' or 'already past'", () => {
    expect(ALL_STRINGS.filter(([, text]) => TIME_RELATIVE.test(text)).map(([p]) => p)).toEqual([]);
    expect(TIME_RELATIVE.test("The nomination deadline is today (2026-09-30).")).toBe(true);
    expect(TIME_RELATIVE.test("Today's and this week's hours for Vail Commons")).toBe(false);
  });

  it("decodes HTML entities everywhere", () => {
    const entity = /&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/;
    expect(ALL_STRINGS.filter(([, text]) => entity.test(text)).map(([path]) => path)).toEqual([]);
  });
});

// ---- (d) no ratings ------------------------------------------------------------------------------------------------

/** Any key that names a professor, a rating, difficulty or workload (substring match: "avgDifficulty" too). */
const RATING_KEY = /best.?prof|professor|instructor|difficult|rating|rmp|workload/i;

function ratingKeys(data: readonly (readonly [name: string, value: unknown])[]): string[] {
  const found: string[] = [];
  for (const [name, value] of data) {
    for (const [path, key] of keys(value, name))
      if (RATING_KEY.test(key)) found.push(`${path}.${key}`);
  }
  return found;
}

describe("(d) no invented ratings", () => {
  it("scans every module in server/content, not only the barrel", () => {
    expect(MODULE_FILES).toEqual(
      expect.arrayContaining([
        "academic-calendar.ts",
        "alumni.ts",
        "careers.ts",
        "index.ts",
        "links.ts",
        "offices.ts",
        "requirements.ts",
      ]),
    );
    const scanned = new Set(EXPORTED_DATA.map(([name]) => name.split(":")[0]));
    for (const file of [
      "academic-calendar.ts",
      "alumni.ts",
      "careers.ts",
      "links.ts",
      "offices.ts",
    ]) {
      expect(scanned.has(file)).toBe(true);
    }
  });

  it("has no bestProfessor, difficulty or rating fields anywhere", () => {
    expect(ratingKeys(EXPORTED_DATA)).toEqual([]);
  });

  it("catches compound keys such as avgDifficulty and professorRatings", () => {
    const career = { ...structuredClone(CAREERS[0]!), avgDifficulty: 3.2, professorRatings: [] };
    expect(ratingKeys([["careers", [career]]])).toEqual([
      "careers[0].avgDifficulty",
      "careers[0].professorRatings",
    ]);
  });
});

// ---- (e) link rules ------------------------------------------------------------------------------------------------

const URL_IN_TEXT = /https:\/\/[^\s"'<>()]+[^\s"'<>().,;:]/g;

function linkProblems(texts: readonly (readonly [path: string, text: string])[]): string[] {
  const problems: string[] = [];
  for (const [path, text] of texts) {
    for (const [raw] of text.matchAll(URL_IN_TEXT)) {
      const url = new URL(raw);
      if (/(^|\.)joinhandshake\.com$/.test(url.hostname)) {
        const documented = url.pathname in HANDSHAKE_DOCUMENTED_PATHS;
        if (
          url.hostname !== "davidson.joinhandshake.com" ||
          (url.pathname !== "/" && !documented)
        ) {
          problems.push(`Handshake URL not documented by Davidson: ${raw} at ${path}`);
        } else if (url.search || url.hash) {
          problems.push(`Handshake URL with a query: ${raw} at ${path}`);
        }
      }
      if (/(^|\.)moodle\.davidson\.edu$/.test(url.hostname)) {
        problems.push(`Moodle URL (out of scope, PLAN §1): ${raw} at ${path}`);
      }
    }
  }
  return problems;
}

describe("(e) link rules", () => {
  it("links Handshake only at its base URL or a published path, and no Moodle page", () => {
    expect(linkProblems(ALL_STRINGS)).toEqual([]);
  });

  it("catches an invented Handshake search URL and a Moodle link", () => {
    expect(
      linkProblems([
        ["a", "https://davidson.joinhandshake.com/job-search?query=data"],
        ["b", "see https://davidson.joinhandshake.com/?q=x."],
        ["c", "tutoring (https://moodle.davidson.edu/course/view.php?id=11404)"],
      ]),
    ).toEqual([
      "Handshake URL not documented by Davidson: https://davidson.joinhandshake.com/job-search?query=data at a",
      "Handshake URL with a query: https://davidson.joinhandshake.com/?q=x at b",
      "Moodle URL (out of scope, PLAN §1): https://moodle.davidson.edu/course/view.php?id=11404 at c",
    ]);
  });
});
