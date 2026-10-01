import { describe, expect, it } from "vitest";
import {
  conflictWhen,
  courseCodes,
  inPlanTerms,
  planPresence,
  previewWarnings,
  sectionConflicts,
  type PlannedSection,
  type StudentPlan,
} from "@/app/(hub)/courses/_lib/student";
import { programsForCodes } from "@/app/(hub)/courses/_lib/programs";
import type { Course, ResolvedTerms } from "@/lib/types/catalog";
import { course, planItem, section } from "./helpers";

/**
 * What an add would be warned about before the student presses the button (PLAN §5 "Plan items": retakes warn,
 * never block; "Sections": restrictions flag, never block; conflicts include second meeting times; cross-listed
 * siblings are one class). Real Spring 2027 / Fall 2026 sections from the fixtures.
 */

const AT = new Date("2026-09-30T12:00:00-04:00");
const TERMS = null as ResolvedTerms | null;

function student(items: StudentPlan["items"], graduationYear = 2028): StudentPlan {
  return {
    items,
    context: { graduationYear, firstTerm: `${graduationYear - 4}01`, standingOverride: null },
    at: AT,
  };
}

function planned(...sections: ReturnType<typeof section>[]): PlannedSection[] {
  return sections.map((s) => ({
    item: planItem({ courseCode: s.courseCode, crn: s.crn, termCode: s.termCode }),
    section: s,
  }));
}

const messages = (list: { message: string }[]) => list.map((w) => w.message);

describe("previewWarnings", () => {
  it("warns about a retake of a completed course, naming the term", () => {
    const plan = student([
      planItem({ courseCode: "CSC 221", termCode: "202501", status: "completed" }),
    ]);
    const list = previewWarnings(plan, course("202602", "CSC 221"), [], {
      term: "202602",
      terms: TERMS,
    });
    expect(list.map((w) => w.code)).toEqual(["already-completed"]);
    expect(list[0]!.message).toBe("Already completed in Fall 2025 — plan a retake?");
  });

  it("does not call a dropped or merely planned copy a retake", () => {
    const plan = student([
      planItem({ courseCode: "CSC 221", termCode: "202501", status: "dropped" }),
      planItem({ courseCode: "CSC 221", termCode: "202601", status: "planned" }),
    ]);
    expect(
      previewWarnings(plan, course("202602", "CSC 221"), [], { term: "202602", terms: TERMS }),
    ).toEqual([]);
  });

  it("flags a course whose every section excludes the student's standing", () => {
    // Class of 2028 = a junior in Spring 2027; ANT 285 A is first-years and sophomores only.
    const list = previewWarnings(student([]), course("202602", "ANT 285"), [], {
      term: "202602",
      terms: TERMS,
    });
    expect(list.map((w) => w.code)).toEqual(["restricted-standing"]);
    expect(list[0]!.message).toMatch(/limited to first-years and sophomores; you are a junior/);
  });

  it("does not flag a course with an open section, but flags the chosen restricted section", () => {
    const art = course("202602", "ART 101"); // A: 12+, B: 34+
    expect(previewWarnings(student([]), art, [], { term: "202602", terms: TERMS })).toEqual([]);
    const a = art.sections.find((s) => s.section === "A")!;
    const list = previewWarnings(student([]), art, [], {
      term: "202602",
      terms: TERMS,
      section: a,
    });
    expect(messages(list)).toEqual([
      "ART 101 A is limited to first-years and sophomores until the first day of class; you are a junior.",
    ]);
  });

  it("flags permission-required and W sections once the writing requirement is met", () => {
    const art496 = course("202602", "ART 496");
    expect(
      previewWarnings(student([]), art496, [], { term: "202602", terms: TERMS }).map((w) => w.code),
    ).toContain("permission-required");
    const wri = course("202602", "WRI 101");
    const done = student([
      planItem({
        courseCode: "HUM 104",
        termCode: "202601",
        status: "completed",
        reqCodes: ["COMP"],
      }),
    ]);
    const w = wri.sections.find((s) => s.restrictions.notIfCompMet)!;
    expect(
      previewWarnings(done, wri, [], { term: "202602", terms: TERMS, section: w }).map(
        (x) => x.code,
      ),
    ).toContain("comp-met-w-section");
  });

  it("names a time conflict with a planned section, with every day it overlaps", () => {
    const bio = section("202602", "BIO 201", "A");
    const csc = course("202602", "CSC 221");
    const a = csc.sections.find((s) => s.section === "A")!;
    const list = previewWarnings(student([]), csc, planned(bio), {
      term: "202602",
      terms: TERMS,
      section: a,
    });
    expect(list.map((w) => w.code)).toEqual(["time-conflict"]);
    expect(list[0]!.message).toMatch(
      /^CSC 221 A overlaps BIO 201 A in your Spring 2027 plan \(Mon, Wed, Fri 10:30a–11:20a/,
    );
  });

  it("says another section fits when only some sections conflict (search rows)", () => {
    const bio = section("202602", "BIO 201", "A");
    const csc = course("202602", "CSC 221");
    const list = previewWarnings(student([]), csc, planned(bio), { term: "202602", terms: TERMS });
    expect(messages(list)).toEqual([expect.stringMatching(/another section fits\.$/)]);
  });

  it("says every section conflicts when none fits", () => {
    const bio = section("202602", "BIO 201", "A");
    const csc: Course = {
      ...course("202602", "CSC 221"),
      sections: course("202602", "CSC 221").sections.filter((s) => s.section === "A"),
    };
    const list = previewWarnings(student([]), csc, planned(bio), { term: "202602", terms: TERMS });
    expect(messages(list)).toEqual([expect.stringMatching(/^CSC 221 A overlaps BIO 201 A/)]);
  });

  it("never reports a cross-listed sibling or the course itself as a conflict", () => {
    const env = section("202601", "ENV 214", "A");
    const phy = course("202601", "PHY 214");
    expect(
      previewWarnings(student([]), phy, planned(env), { term: "202601", terms: TERMS }),
    ).toEqual([]);
    const own = section("202602", "CSC 221", "A");
    expect(
      sectionConflicts(
        section("202602", "CSC 221", "A"),
        planned(own),
        courseCodes(course("202602", "CSC 221")),
      ),
    ).toEqual([]);
  });

  it("checks restrictions and conflicts only for the course's own term", () => {
    const list = previewWarnings(student([]), course("202602", "ANT 285"), [], {
      term: "202701",
      terms: TERMS,
    });
    expect(list).toEqual([]);
  });
});

describe("plan presence", () => {
  it("maps active items to their terms by listing and canonical code", () => {
    const presence = planPresence([
      planItem({ courseCode: "PSY 303", canonicalCode: "BIO 331", termCode: "202601" }),
      planItem({ courseCode: "CSC 221", termCode: "202602" }),
      planItem({ courseCode: "CSC 221", termCode: "202701", status: "dropped" }),
      planItem({ courseCode: "AP 100", termCode: null }),
    ]);
    expect(inPlanTerms(presence, new Set(["BIO 331"]))).toEqual(["202601"]);
    expect(inPlanTerms(presence, new Set(["CSC 221"]))).toEqual(["202602"]);
    expect(inPlanTerms(null, new Set(["CSC 221"]))).toEqual([]);
  });

  it("knows a course by its siblings' codes too", () => {
    expect([...courseCodes(course("202601", "BIO 331"))].sort()).toEqual(["BIO 331", "PSY 303"]);
  });
});

describe("conflictWhen", () => {
  it("joins days that share an overlap window", () => {
    const pair = { a: { crn: "1", courseCode: "A 100" }, b: { crn: "2", courseCode: "B 100" } };
    expect(
      conflictWhen([
        { ...pair, day: "M", start: "10:30", end: "11:20" },
        { ...pair, day: "W", start: "10:30", end: "11:20" },
        { ...pair, day: "T", start: "13:30", end: "14:00" },
      ]),
    ).toBe("Mon, Wed 10:30a–11:20a; Tue 1:30p–2:00p");
  });
});

describe("programsForCodes", () => {
  const doc = (offerings: { kind: string; name: string; courseCodes: string[] }[], read = true) =>
    ({ detailFetchedAt: read ? new Date() : null, offerings }) as never;

  it("lists the offerings of read pages that name the course, sorted, once each", () => {
    const result = programsForCodes(
      [
        {
          legacyId: 1,
          doc: doc([
            {
              kind: "major",
              name: "Major in Computer Science (B.S. Degree)",
              courseCodes: ["CSC 221"],
            },
            { kind: "minor", name: "Minor in Computer Science", courseCodes: ["CSC 121"] },
          ]),
        },
        {
          legacyId: 2,
          doc: doc([
            {
              kind: "interdisciplinary-minor",
              name: "Interdisciplinary Minor in Data Science",
              courseCodes: ["csc 221"],
            },
          ]),
        },
        {
          legacyId: 3,
          doc: doc([{ kind: "major", name: "Unread", courseCodes: ["CSC 221"] }], false),
        },
        { legacyId: null, doc: null },
      ],
      ["CSC 221"],
    );
    expect(result.matches.map((m) => m.name)).toEqual([
      "Interdisciplinary Minor in Data Science",
      "Major in Computer Science (B.S. Degree)",
    ]);
    expect(result.matches[1]!.url).toMatch(/^https:\/\/catalog\.davidson\.edu\/.*poid=1$/);
    expect(result).toMatchObject({ pagesRead: 2, pagesTotal: 4 });
  });
});
