import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { fixtureIndex, fixtureSections } from "./helpers";
import { CatalogQuerySchema, type CatalogQueryInput } from "@/lib/types/catalog";
import {
  buildCourse,
  courseLevel,
  courseTitle,
  isCompanionLab,
  summarizeCourse,
} from "@/server/catalog/courses";
import {
  matchCourses,
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

  it("takes the title most sections share; topics courses keep their section titles", () => {
    expect(courseTitle(sectionsOf("202601", "BIO 371"))).toBe("Research in Biology I");
    const wri = buildCourse(sectionsOf("202601", "WRI 101"));
    expect(wri.sections.map((s) => s.section).slice(0, 4)).toEqual(["A", "AA", "B", "C"]);
    expect(wri.title).toBe("The Politics of Love"); // C and I share it; earliest-section tie-break
    expect(wri.sections.find((s) => s.section === "A")?.title).toBe("According to Science");
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
    expect(prepareTextQuery(" \t ", spring.subjects)).toEqual({ kind: "none" });
  });

  it("matches partial codes and department codes", () => {
    const twoHundreds = codes({ q: "CSC 2" });
    expect(twoHundreds.length).toBeGreaterThan(0);
    expect(twoHundreds.every((code) => code.startsWith("CSC 2"))).toBe(true);
    expect(codes({ q: "csc22" })).toEqual(["CSC 221"]);
    const csc = codes({ q: "csc" });
    expect(csc).toEqual(expect.arrayContaining(["CSC 110", "CSC 221", "MAT 210", "PHY 240"]));
    expect(
      csc.every(
        (code) => code.startsWith("CSC") || ["MAT 210", "MAT 315", "PHY 240"].includes(code),
      ),
    ).toBe(true);
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
    for (const course of open) {
      expect(course.course.sections.some((s) => s.enrollment.remaining > 0)).toBe(true);
    }
    expect(codes({ openOnly: true }, fixtureIndex("202201"))).not.toContain("ART 111");
    const intro = codes({ level: ["100"] });
    expect(intro.length).toBeGreaterThan(0);
    expect(intro.every((code) => code.split(" ")[1]!.startsWith("1"))).toBe(true);
    expect(
      codes({ level: ["000"] }, fall).every((code) => code.split(" ")[1]!.startsWith("0")),
    ).toBe(true);
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
