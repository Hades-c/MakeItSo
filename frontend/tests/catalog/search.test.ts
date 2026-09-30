import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { fixtureIndex, fixtureSections } from "./helpers";
import { CatalogQuerySchema, type CatalogQueryInput } from "@/lib/types/catalog";
import {
  buildCourse,
  courseLevel,
  courseTitle,
  isCompanionLab,
  isTopicsCourse,
  registrableSeats,
  summarizeCourse,
} from "@/server/catalog/courses";
import {
  matchCourses,
  matchedSectionTitle,
  paletteMatches,
  prepareTextQuery,
  searchIndex,
  sectionMatches,
} from "@/server/catalog/search";

const spring = fixtureIndex("202602");
const fall = fixtureIndex("202601");

function codes(query: CatalogQueryInput, index = spring): string[] {
  return matchCourses(index, CatalogQuerySchema.parse(query)).map((course) => course.code);
}

describe("course grouping", () => {
  const sectionsOf = (term: string, code: string) =>
    fixtureSections(term).filter((s) => s.courseCode === code);

  it("ignores companion lab sections for the course title", () => {
    const mil = sectionsOf("202601", "MIL 101");
    expect(mil.map((s) => [s.section, s.title])).toEqual([
      ["A", "Introduction to the Army"],
      ["L", "Leadership Lab Indv Tasks 1"],
    ]);
    expect(isCompanionLab(mil[1]!, mil)).toBe(true);
    expect(courseTitle(mil)).toBe("Introduction to the Army");
    // "+Lab" in every section's title is the course itself, not a companion.
    const bio = sectionsOf("202501", "BIO 115");
    expect(bio.every((s) => !isCompanionLab(s, bio))).toBe(true);
  });

  it("takes the title at least half the sections share, and no other title matches", () => {
    expect(courseTitle(sectionsOf("202601", "BIO 371"))).toBe("Research in Biology I");
    const base = sectionsOf("202601", "BIO 371")[0]!;
    const titled = (...titles: string[]) =>
      titles.map((title, i) => ({ ...base, section: String.fromCharCode(65 + i), title }));
    expect(courseTitle(titled("Solo"))).toBe("Solo");
    expect(courseTitle(titled("X", "X", "Y", "Z"))).toBe("X"); // half share it
    expect(courseTitle(titled("X", "Y", "X"))).toBe("X");
    expect(courseTitle(titled("X", "X", "Y", "Y"), "Biology")).toBe(
      "Biology: topics vary by section",
    ); // a tie is no majority
    expect(courseTitle(titled("X", "Y"), "Biology")).toBe("Biology: topics vary by section");
    expect(courseTitle(titled("X", "Y", "Z"))).toBe("Topics vary by section"); // no department name
    expect(isTopicsCourse(titled("X", "Y"))).toBe(true);
    expect(isTopicsCourse(titled("X", "X"))).toBe(false);
  });

  it("gives topics courses a neutral title and keeps every section's own title (WRI 101, CSC 390, ECO 495)", () => {
    // WRI 101: 24 sections, 22 titles in Fall 2026 (two share "The Politics of Love"); 16 sections in Spring 2027.
    const wri = fall.byCode.get("WRI 101")!;
    expect(wri.course.title).toBe("Writing Program: topics vary by section");
    expect(wri.summary.title).toBe("Writing Program: topics vary by section");
    expect(wri.topics).toBe(true);
    expect(wri.course.sections.find((s) => s.section === "A")?.title).toBe("According to Science");
    expect(spring.byCode.get("WRI 101")?.course.title).toBe(
      "Writing Program: topics vary by section",
    );
    const csc390 = fall.byCode.get("CSC 390")!;
    expect(csc390.course.title).toBe("Computer Science: topics vary by section");
    expect(csc390.course.sections.map((s) => s.title)).toContain("Advanced Ranking Methods");
    // ECO 495 in Spring 2027: A "Beckerian Economics", B "Senior Seminar", … six titles, none shared.
    const eco495 = spring.byCode.get("ECO 495")!;
    expect(eco495.course.title).toBe("Economics: topics vary by section");
    expect(eco495.course.sections.slice(0, 2).map((s) => s.title)).toEqual([
      "Beckerian Economics",
      "Senior Seminar",
    ]);
    // POL 485: "Honors Thesis" on 3 of 9 sections is no majority either.
    expect(fall.byCode.get("POL 485")?.course.title).toBe(
      "Political Science: topics vary by section",
    );
    // Courses whose sections share a title keep it.
    expect(spring.byCode.get("CSC 121")?.course.title).toBe("Programming & Problem Solving");
    expect(spring.byCode.get("CSC 121")?.topics).toBe(false);
    const wriBuilt = buildCourse(sectionsOf("202601", "WRI 101"), {
      subjectName: "Writing Program",
    });
    expect(wriBuilt.title).toBe("Writing Program: topics vary by section");
  });

  it("summarises a course: credits, requirements, seats, people, siblings, TBA", () => {
    const hum = buildCourse(sectionsOf("202601", "HUM 103"));
    expect(hum.credits).toEqual([2]);
    const phy = summarizeCourse(buildCourse(sectionsOf("202601", "PHY 214")));
    expect(phy.crossListings).toEqual(["ENV 214"]);
    expect(phy.sectionCount).toBe(2);
    const study = summarizeCourse(buildCourse(sectionsOf("202601", "CSC 395")));
    expect(study.hasTba).toBe(true);
    const art = summarizeCourse(buildCourse(sectionsOf("202201", "ART 111")));
    expect(art.openSeats).toBe(0); // remaining -2 counts as 0
    const afr = summarizeCourse(buildCourse(sectionsOf("202602", "AFR 101")));
    expect(afr).toMatchObject({
      code: "AFR 101",
      title: "Intro to Africana Studies",
      reqCodes: ["CULT"],
      openSeats: 30,
      instructorNames: ["Hilary Green"],
      crossListings: [],
      hasTba: false,
    });
    expect(courseLevel("101")).toBe("100");
    expect(courseLevel("012")).toBe("000");
    expect(courseLevel("495")).toBe("400");
    expect(courseLevel("512")).toBeNull();
  });

  it("indexes every course of a full term once, sorted by code", () => {
    const all = spring.courses.map((c) => c.code);
    expect(all).toEqual([...all].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(new Set(fixtureSections("202602").map((s) => s.courseCode)).size);
    expect(spring.byCrn.size).toBe(485);
  });
});

describe("text queries", () => {
  it("normalises course codes in every spelling", () => {
    for (const q of ["CSC121", "csc 121", "  CSC   121 ", "CSC-121", "csc121"]) {
      expect(codes({ q }), q).toEqual(["CSC 121"]);
    }
  });

  it("treats a whitespace-only query as no filter", () => {
    const everything = spring.courses.length;
    expect(codes({ q: "   " })).toHaveLength(everything);
    expect(codes({})).toHaveLength(everything);
    expect(prepareTextQuery(" \t ", spring)).toEqual({ kind: "none" });
    expect(prepareTextQuery("\u200B \u00A0", spring)).toEqual({ kind: "none" });
  });

  it("matches partial codes and department codes", () => {
    const twoHundreds = codes({ q: "CSC 2" });
    expect(twoHundreds.length).toBeGreaterThan(0);
    expect(twoHundreds.every((code) => code.startsWith("CSC 2"))).toBe(true);
    expect(codes({ q: "csc22" })).toEqual(["CSC 221"]);
    const csc = codes({ q: "csc" });
    expect(csc).toEqual(expect.arrayContaining(["CSC 110", "CSC 221", "MAT 210", "PHY 240"]));
    // The department (subject or cross-posting), plus courses where "CSC" stands on its own (a cross-listed
    // code, a description that names a CSC course).
    for (const code of csc) {
      const course = spring.byCode.get(code)!;
      expect(
        course.subject === "CSC" ||
          course.crossPostings.has("CSC") ||
          /\bcsc\b/.test(course.haystack),
        code,
      ).toBe(true);
    }
  });

  it("a department code also finds the word in instructor names, titles and descriptions ('Dan')", () => {
    const dan = codes({ q: "Dan" });
    expect(dan).toEqual(expect.arrayContaining(["DAN 101", "DAN 140", "DAN 150", "DAN 340"]));
    // Dan Aldridge teaches HIS 142, 349 and 449; instructors named Dan teach MUS 116 and PHY 116.
    expect(dan).toEqual(
      expect.arrayContaining(["HIS 142", "HIS 349", "HIS 449", "MUS 116", "PHY 116"]),
    );
    expect(codes({ q: "Dan Aldridge" })).toEqual(["HIS 142", "HIS 349", "HIS 449"]);
    // A whole word only: "Jordan" is not "Dan".
    for (const code of dan) {
      const course = spring.byCode.get(code)!;
      expect(course.subject === "DAN" || /\bdan\b/.test(course.haystack), code).toBe(true);
    }
    // The palette ranks the department's own courses first.
    const palette = paletteMatches(spring, "dan", 20).map((c) => c.code);
    expect(palette.slice(0, 4)).toEqual(["DAN 101", "DAN 140", "DAN 150", "DAN 340"]);
    expect(palette).toEqual(expect.arrayContaining(["HIS 142", "MUS 116", "PHY 116"]));
  });

  it("recognises departments that exist only as cross-postings (FMD, INEU, IGEN, EAS)", () => {
    for (const dept of ["FMD", "INEU", "IGEN", "EAS"]) {
      expect(spring.subjects.has(dept), dept).toBe(true);
      expect(prepareTextQuery(dept.toLowerCase(), spring)).toMatchObject({
        kind: "dept",
        subject: dept,
      });
      const byQuery = codes({ q: dept });
      const byFilter = codes({ dept: [dept] });
      expect(byFilter.length, dept).toBeGreaterThan(10);
      expect(byQuery, dept).toEqual(expect.arrayContaining(byFilter));
      expect(paletteMatches(spring, dept, 5).length, dept).toBe(5);
    }
    // "EAS" no longer matches every "east" and "ease".
    expect(codes({ q: "EAS" })).toHaveLength(codes({ dept: ["EAS"] }).length);
  });

  it("matches titles, section titles, every instructor and descriptions, ignoring case and accents", () => {
    // Descriptions count too (CSC 121, CSC 321 and EDU 200 mention data structures); results stay code-sorted.
    const structures = codes({ q: "data structures" });
    expect(structures).toContain("CSC 221");
    for (const code of structures) {
      expect(spring.byCode.get(code)?.haystack).toMatch(
        /data[\s\S]*structures|structures[\s\S]*data/,
      );
    }
    expect(codes({ q: "Writing with Gandhi" })).toEqual(["WRI 101"]);
    expect(codes({ q: "hilary green" })).toEqual(["AFR 101", "AFR 224"]);
    expect(codes({ q: "kentucky route zero" })).toEqual(["ENG 110"]);
    expect(codes({ q: "BEYONCE" })).toEqual(["ENG 110"]);
    expect(codes({ q: "zzzz-no-such-course" })).toEqual([]);
  });

  it("normalises what people actually type: sections, punctuation, several codes, invisible characters", () => {
    const cases: [string, string[]][] = [
      ["CSC121A", ["CSC 121"]],
      ["csc 121a", ["CSC 121"]],
      ["CSC 121-A", ["CSC 121"]],
      ["CSC 121 A", ["CSC 121"]],
      ["CHE 430-A", ["CHE 430"]], // upstream's own "REG FOR CHE 430-A" spelling
      ["CSC.121", ["CSC 121"]],
      ["csc,121", ["CSC 121"]],
      ["CSC_121", ["CSC 121"]],
      ["\u200BCSC121", ["CSC 121"]],
      ["CSC\u00AD121", ["CSC 121"]],
      ["\uFF23\uFF53\uFF43\u3000\uFF11\uFF12\uFF11", ["CSC 121"]], // fullwidth "Ｃｓｃ　１２１"
      ["CSC121 CSC221", ["CSC 121", "CSC 221"]],
      ["csc 121, csc 221", ["CSC 121", "CSC 221"]],
      ["CSC 121 or CSC 221", ["CSC 121", "CSC 221"]],
      ["CSC 121 / AFR 101", ["AFR 101", "CSC 121"]],
    ];
    for (const [q, expected] of cases) {
      expect(codes({ q }), JSON.stringify(q)).toEqual(expected);
      expect(
        paletteMatches(spring, q, 5).map((c) => c.code),
        JSON.stringify(q),
      ).toEqual(expected);
    }
    expect(prepareTextQuery("CSC 121-A", spring)).toEqual({ kind: "codes", codes: ["CSC 121"] });
    // A lettered course number wins when the term has one (none in the fixtures: a synthetic alias).
    expect(
      prepareTextQuery("MUS101L", { subjects: spring.subjects, aliasCodes: new Set(["MUS 101L"]) }),
    ).toEqual({ kind: "codes", codes: ["MUS 101L"] });
    // "OR"/"AND" are separators, not sections; a code next to other words is one more word.
    expect(prepareTextQuery("csc 121 python", spring)).toEqual({
      kind: "words",
      words: ["csc 121", "python"],
    });
    expect(codes({ q: "problem-solving" })).toContain("CSC 121");
    expect(paletteMatches(spring, "problem-solving", 5).map((c) => c.code)).toEqual(["CSC 121"]);
    expect(codes({ q: "Programming, Problem Solving" })).toContain("CSC 121");
  });

  it("ignores apostrophe styles: iOS smart punctuation finds O'Geen, O'Keefe and women's", () => {
    const geen = ["POL 182", "POL 327", "POL 485"];
    for (const q of ["O'Geen", "O\u2019Geen", "o\u2018geen", "O\u02BCGeen", "O''Geen", "ogeen"]) {
      expect(codes({ q }, fall), JSON.stringify(q)).toEqual(geen);
    }
    for (const q of ["O'Keefe", "O\u2019Keefe", "okeefe"]) {
      expect(codes({ q }, fall), q).toEqual(["ECO 202", "ECO 495"]);
    }
    expect(codes({ q: "black women\u2019s" }, fall)).toEqual(["AFR 247", "AFR 283"]);
    expect(codes({ q: "black women's" }, fall)).toEqual(["AFR 247", "AFR 283"]);
    expect(codes({ q: "children\u2019s" })).toEqual(["ENG 110"]);
    expect(paletteMatches(fall, "O\u2019Geen", 5).map((c) => c.code)).toEqual(geen);
  });

  it("finds cross-listed and registration codes when no listing has them", () => {
    expect(codes({ q: "PHY 214" }, fall)).toEqual(["PHY 214"]);
    expect(codes({ q: "ENV 214" }, fall)).toEqual(["ENV 214"]);
    expect(codes({ q: "BIO 395" })).toEqual(["CHE 430"]);
  });
});

describe("filters (OR within a list, AND across; section filters on one section)", () => {
  it("dept matches the subject or a cross-posting", () => {
    const result = codes({ dept: ["CSC", "MAT"] });
    expect(result).toEqual(expect.arrayContaining(["CSC 121", "MAT 210"]));
    expect(
      result.every(
        (code) => code.startsWith("CSC") || code.startsWith("MAT") || code === "PHY 240",
      ),
    ).toBe(true);
  });

  it("req matches a section's own codes", () => {
    const result = matchCourses(spring, CatalogQuerySchema.parse({ req: ["LTRQ", "VPRQ"] }));
    expect(result.length).toBeGreaterThan(10);
    for (const course of result) {
      expect(
        course.course.sections.some((s) => s.reqCodes?.some((c) => c === "LTRQ" || c === "VPRQ")),
      ).toBe(true);
    }
  });

  it("days = the days the student is free: every timed meeting on those days", () => {
    const query = CatalogQuerySchema.parse({ days: ["T", "R"] });
    const result = matchCourses(spring, query);
    expect(result.map((c) => c.code)).toContain("AFR 101");
    expect(result.map((c) => c.code)).not.toContain("CSC 121");
    for (const course of result) {
      expect(course.course.sections.some((s) => sectionMatches(s, query))).toBe(true);
    }
    const section = spring.byCode.get("AFR 101")!.course.sections[0]!;
    expect(sectionMatches(section, CatalogQuerySchema.parse({ days: ["T"] }))).toBe(false);
    expect(sectionMatches(section, CatalogQuerySchema.parse({ days: ["M", "T", "W", "R"] }))).toBe(
      true,
    );
  });

  it("after / before bound every timed meeting; TBA meetings never exclude", () => {
    const afternoon = CatalogQuerySchema.parse({ after: "13:00" });
    for (const course of matchCourses(spring, afternoon)) {
      expect(
        course.course.sections.some((s) =>
          s.meetings.filter((m) => !m.tba).every((m) => m.start! >= "13:00"),
        ),
      ).toBe(true);
    }
    const morning = codes({ before: "12:00" });
    expect(morning).toContain("AFR 101"); // 09:40–10:55
    expect(codes({ after: "13:00" })).not.toContain("AFR 101");
    const tbaOnly = fall.byCode.get("CSC 395")!.course.sections[0]!;
    expect(sectionMatches(tbaOnly, CatalogQuerySchema.parse({ days: ["M"], after: "20:00" }))).toBe(
      true,
    );
  });

  it("openOnly needs a section with seats; level uses the hundreds digit", () => {
    const open = matchCourses(spring, CatalogQuerySchema.parse({ openOnly: "true" }));
    const lookup = (crn: string) => spring.byCrn.get(crn);
    for (const course of open) {
      expect(course.course.sections.some((s) => registrableSeats(s, lookup) > 0)).toBe(true);
    }
    expect(codes({ openOnly: true }, fixtureIndex("202201"))).not.toContain("ART 111");
    const intro = codes({ level: ["100"] });
    expect(intro.length).toBeGreaterThan(0);
    expect(intro.every((code) => code.split(" ")[1]!.startsWith("1"))).toBe(true);
    expect(
      codes({ level: ["000"] }, fall).every((code) => code.split(" ")[1]!.startsWith("0")),
    ).toBe(true);
  });

  it("counts a max-0 cross-listed listing's sibling seats ('Register as PHY 214')", () => {
    // ENV 214 A/B have max 0 and are the same classes as PHY 214 A/B (4 and 1 open seats), matched by CRN.
    const env = fall.byCode.get("ENV 214")!;
    expect(env.course.sections.map((s) => s.enrollment.max)).toEqual([0, 0]);
    expect(codes({ q: "ENV 214", openOnly: true }, fall)).toEqual(["ENV 214"]);
    expect(codes({ q: "PHY 214", openOnly: true }, fall)).toEqual(["PHY 214"]);
    expect(env.summary.openSeats).toBe(5);
    expect(fall.byCode.get("PHY 214")?.summary.openSeats).toBe(5);
    const lookup = (crn: string) => fall.byCrn.get(crn);
    const [envA] = env.course.sections;
    expect(registrableSeats(envA!, lookup)).toBe(4);
    expect(registrableSeats(envA!)).toBe(0); // without the term's sections: its own seats only
    expect(sectionMatches(envA!, CatalogQuerySchema.parse({ openOnly: true }), lookup)).toBe(true);
    // The other max-0 listings of the term are cross-listed too, and follow their siblings.
    for (const code of ["BIO 331", "ENG 285"]) {
      const course = fall.byCode.get(code)!;
      const listing = course.course.sections.find((s) => s.enrollment.max === 0)!;
      const siblings = listing.crossListings.map((l) => fall.byCrn.get(l.crn)!);
      expect(registrableSeats(listing, lookup), code).toBe(
        siblings.reduce((sum, s) => sum + Math.max(0, s.enrollment.remaining), 0),
      );
    }
  });

  it("combines filters with AND", () => {
    expect(
      codes({ q: "africana", days: ["T", "R"], before: "12:00", dept: ["AFR"], level: ["100"] }),
    ).toEqual(["AFR 101"]);
    expect(codes({ q: "africana", dept: ["CSC"] })).toEqual([]);
  });
});

describe("pagination", () => {
  it("pages a stable, code-sorted result", () => {
    const query = (page: number) =>
      CatalogQuerySchema.parse({ level: ["100"], page, pageSize: 10 });
    const first = searchIndex(spring, query(1));
    const second = searchIndex(spring, query(2));
    const all = matchCourses(spring, CatalogQuerySchema.parse({ level: ["100"] })).map(
      (c) => c.code,
    );
    expect(first.total).toBe(all.length);
    expect(second.total).toBe(all.length);
    expect([...first.items, ...second.items].map((i) => i.code)).toEqual(all.slice(0, 20));
    const beyond = searchIndex(spring, query(1000));
    expect(beyond).toEqual({ items: [], total: all.length });
  });
});

describe("the ⌘K palette's matches", () => {
  it("puts exact codes first and skips descriptions", () => {
    expect(paletteMatches(spring, "csc121", 5).map((c) => c.code)).toEqual(["CSC 121"]);
    expect(paletteMatches(spring, "BIO 395", 5).map((c) => c.code)).toEqual(["CHE 430"]);
    expect(paletteMatches(spring, "kentucky route zero", 5)).toEqual([]);
    expect(paletteMatches(spring, "hilary green", 5).map((c) => c.code)).toEqual([
      "AFR 101",
      "AFR 224",
    ]);
    expect(paletteMatches(spring, "Data Structures", 5).map((c) => c.code)).toEqual(["CSC 221"]);
    const csc = paletteMatches(spring, "CSC", 20).map((c) => c.code);
    expect(csc.slice(0, 3)).toEqual(["CSC 110", "CSC 121", "CSC 221"]);
    expect(csc.indexOf("MAT 210")).toBeGreaterThan(csc.indexOf("CSC 374"));
    expect(paletteMatches(spring, "data", 3)).toHaveLength(3);
    expect(paletteMatches(spring, "   ", 5)).toEqual([]);
  });

  it("names the matching topic of a topics course", () => {
    const [wri] = paletteMatches(spring, "religion public square", 5);
    expect(wri?.code).toBe("WRI 101");
    expect(matchedSectionTitle(wri!, "religion public square")).toBe(
      "Religion in the Public Square",
    );
    expect(matchedSectionTitle(wri!, "wri 101")).toBeNull(); // a code query names no topic
    const csc = spring.byCode.get("CSC 121")!;
    expect(matchedSectionTitle(csc, "programming")).toBeNull(); // not a topics course
  });
});

describe("performance (PLAN §6.1 W1: search < 100 ms)", () => {
  it("indexes a full term and answers 200 queries with p95 < 100 ms", () => {
    const buildStart = performance.now();
    const index = fixtureIndex("202601");
    const buildMs = performance.now() - buildStart;
    const queries: CatalogQueryInput[] = [
      { q: "CSC121" },
      { q: "csc 2" },
      { q: "data" },
      { q: "introduction to" },
      { q: "green" },
      { q: "environmental justice" },
      { days: ["T", "R"], after: "10:00" },
      { req: ["LTRQ"], openOnly: true },
      { dept: ["HIS", "POL"], level: ["200", "300"] },
      { q: "research", page: 2, pageSize: 10 },
      { q: "dan" },
      { q: "O\u2019Keefe" },
      { q: "CSC 121-A, MAT 110" },
      { q: "problem-solving", openOnly: true },
    ];
    const timings: number[] = [];
    for (let i = 0; i < 200; i++) {
      const query = CatalogQuerySchema.parse(queries[i % queries.length]);
      const start = performance.now();
      searchIndex(index, query);
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95)]!;
    expect(p95).toBeLessThan(100);
    expect(buildMs).toBeLessThan(2_000);
  });
});
