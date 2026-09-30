import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CourseCodeSchema } from "@/lib/types/common";
import { MISSING_COURSE } from "@/server/programs/html";
import {
  classifyHeading,
  courseCodesIn,
  pagePrefix,
  parseProgramDetail,
  requirementsTextOf,
} from "@/server/programs/parse";
import {
  type AcalogCore,
  AcalogProgramDetailSchema,
  AcalogProgramListSchema,
  isPublicProgram,
} from "@/server/programs/upstream";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "external", "catalog");

function fixturePage(id: number) {
  return AcalogProgramDetailSchema.parse(
    JSON.parse(readFileSync(path.join(FIXTURES, `program-${id}.json`), "utf8")),
  );
}

const PUBLIC_NAMES = AcalogProgramListSchema.parse(
  JSON.parse(readFileSync(path.join(FIXTURES, "programs.json"), "utf8")),
)
  ["program-list"].filter(isPublicProgram)
  .map((item) => item.name);

let nextId = 1;
function core(name: string, description = "", extra: Partial<AcalogCore> = {}): AcalogCore {
  const id = nextId++;
  return { id, name, description, courses: [], children: [], sort_order: id, ...extra };
}

function page(
  name: string,
  cores: AcalogCore[],
  { types = ["Academic Courses/Major and Minor Requirements"] }: { types?: string[] } = {},
) {
  return AcalogProgramDetailSchema.parse({
    id: 9000 + nextId++,
    "legacy-id": 1234,
    "catalog-id": 4,
    modified: "2026-09-30 12:00:00",
    name,
    code: "",
    status: { active: true, visible: true },
    program_types: types.map((type) => ({ name: type })),
    description: "<p>Professors: Someone</p>",
    cores,
  });
}

function offerings(detail: ReturnType<typeof page>, otherProgramNames: string[] = []) {
  return parseProgramDetail(detail, { otherProgramNames }).offerings;
}

const REQUIRES = "<p>The minor requires six courses.</p>";

describe("parseProgramDetail on the recorded catalog pages", () => {
  it("Computer Science (172): the B.S. major and the minor, with text and the codes it names", () => {
    const parsed = parseProgramDetail(fixturePage(172), { otherProgramNames: PUBLIC_NAMES });
    expect(parsed).toMatchObject({
      acalogId: 172,
      legacyId: 1799,
      name: "Computer Science",
      code: "CS",
      modified: "2026-09-15 15:03:36",
    });
    expect(parsed.offerings.map(({ kind, name, degree }) => ({ kind, name, degree }))).toEqual([
      { kind: "major", name: "Major in Computer Science (B.S. Degree)", degree: "B.S." },
      { kind: "minor", name: "Minor in Computer Science", degree: null },
    ]);
    const [major, minor] = parsed.offerings;
    expect(major?.courseCodes).toEqual(["MAT 230", "CSC 221", "CSC 381", "CSC 382", "CSC 383"]);
    const text = requirementsTextOf(major?.sections ?? []);
    expect(text.startsWith("Major in Computer Science (B.S. Degree)\nMajor Prerequisites:\n")).toBe(
      true,
    );
    expect(text).toContain(
      "MAT 230 and CSC 221 should be completed before spring of the junior year.",
    );
    expect(text).toContain("- Advanced placement credit for Computer Science A");
    // Acalog's unlinked course links (see server/programs/html.ts) are counted, not hidden.
    expect(major?.missingCourseRefs).toBe(40);
    expect(text.split(MISSING_COURSE).length - 1).toBe(40);
    expect(minor?.courseCodes).toEqual(["CSC 381", "CSC 382", "CSC 383"]);
    // Department-wide sections (graduate school, honors, the course catalog list) belong to no offering.
    expect(parsed.offerings.flatMap((o) => o.sections.map((s) => s.heading))).toEqual([
      "Major in Computer Science (B.S. Degree)",
      "Minor in Computer Science",
    ]);
    expect(parsed.descriptionText).toMatch(/^Professors: /);
  });

  it("Economics (174): generic headings take the page's name; 'Economics 202' counts as ECO 202", () => {
    const parsed = parseProgramDetail(fixturePage(174), { otherProgramNames: PUBLIC_NAMES });
    expect(parsed.offerings.map(({ kind, name, degree }) => ({ kind, name, degree }))).toEqual([
      { kind: "major", name: "Major in Economics (A.B. Degree)", degree: "A.B." },
      { kind: "minor", name: "Minor in Economics", degree: null },
    ]);
    expect(parsed.offerings[0]?.courseCodes).toEqual([
      "ECO 101",
      "ECO 202",
      "ECO 203",
      "ECO 204",
      "ECO 205",
      "ECO 495",
      "ECO 180",
      "ECO 211",
    ]);
    const minorText = requirementsTextOf(parsed.offerings[1]?.sections ?? []);
    expect(minorText).toContain("3. Economics 202 and Economics 203;");
    expect(minorText).toContain(`2. ${MISSING_COURSE} or Economics 205;`);
  });

  it("Mathematics (188): the B.S. major and the minor", () => {
    const parsed = parseProgramDetail(fixturePage(188), { otherProgramNames: PUBLIC_NAMES });
    expect(parsed.offerings.map((o) => o.name)).toEqual([
      "Major in Mathematics (B.S. Degree)",
      "Minor in Mathematics",
    ]);
    expect(parsed.offerings[0]?.courseCodes).toEqual([
      "MAT 113",
      "MAT 150",
      "MAT 160",
      "MAT 230",
      "MAT 315",
      "MAT 330",
      "MAT 355",
    ]);
    expect(parsed.offerings[0]?.missingCourseRefs).toBe(0);
  });

  it("produces contract-valid course codes and text without markup", () => {
    for (const id of [172, 174, 188]) {
      for (const offering of parseProgramDetail(fixturePage(id), {
        otherProgramNames: PUBLIC_NAMES,
      }).offerings) {
        for (const code of offering.courseCodes) expect(CourseCodeSchema.parse(code)).toBe(code);
        const text = requirementsTextOf(offering.sections);
        expect(text).not.toMatch(/<\/?[a-z]/i);
        expect(text).not.toMatch(/&(?:amp|nbsp|#\d+);/);
      }
    }
  });
});

describe("classifyHeading", () => {
  it.each([
    ["Major in Computer Science (B.S. Degree)", "Computer Science", false, ["major", null, "B.S."]],
    ["Major Requirements (A.B. Degree)", "Economics", false, ["major", null, "A.B."]],
    ["Major (A.B. Degree)", "Anthropology", false, ["major", null, "A.B."]],
    ["Major requirements", "Philosophy, Politics, and Economics", false, ["major", null, null]],
    ["Minor", "Anthropology", false, ["minor", null, null]],
    ["Minor Requirements", "Linguistics", true, ["interdisciplinary-minor", null, null]],
    ["Arab Studies Major (A.B. Degree)", "Arab Studies", false, ["major", null, "A.B."]],
    [
      "Bioinformatics Major (B.S. Degree)",
      "Genomics & Bioinformatics",
      true,
      ["major", "Bioinformatics", "B.S."],
    ],
    [
      "Genomics Interdisciplinary Minor",
      "Genomics & Bioinformatics",
      true,
      ["interdisciplinary-minor", "Genomics", null],
    ],
    [
      "Environmental Studies Interdisciplinary Major (B.A. or B.S. Degree)",
      "Environmental Studies",
      false,
      ["major", null, "B.A. or B.S."],
    ],
    [
      "East Asian Studies Interdisciplinary Minor",
      "East Asian Studies",
      false,
      ["interdisciplinary-minor", null, null],
    ],
    [
      "Interdisciplinary Minor in Latin American Studies",
      "Latin American, Latinx, and Caribbean Studies",
      false,
      ["interdisciplinary-minor", "Latin American Studies", null],
    ],
    ["Minor in Applied Physics Requirements", "Physics", false, ["minor", "Applied Physics", null]],
    ["Russian Studies Major Requirements", "Russian Studies", false, ["major", null, null]],
    [
      "Film and Media Studies Minor Requirements",
      "Film, Media, and Digital Studies",
      false,
      ["minor", "Film and Media Studies", null],
    ],
  ] as const)(
    "%j on %j → offering",
    (name, pageName, interdisciplinary, [kind, subject, degree]) => {
      expect(classifyHeading(name, pageName, interdisciplinary)).toMatchObject({
        kind,
        subject,
        degree,
        track: false,
      });
    },
  );

  it.each([
    ["Minor Requirements - Social Science Track", "minor"],
    ["Major With Engineering Dual Degree (3-2) Track", "major"],
    ["Major Requirements (Engineering Dual Degree (3-2) Track)", "major"],
  ] as const)("%j is a track of the %s", (name, family) => {
    expect(classifyHeading(name, "Physics", false)).toMatchObject({
      family,
      track: true,
      degree: null,
    });
  });

  it.each([
    "Honors Requirements",
    "Africana Studies Honors",
    "Related Majors and Minors",
    "Information for Prospective Mathematics Majors and Minors",
    "Goals of the Major and Minor in Educational Studies",
    "Production Requirements for Majors and Minors",
    "Introduction to the Major",
    "Basic Structure of the Minor",
    "Non-LAS-Prefixed Methods Courses for the LAS Major",
    "Electives counting toward the LAS Major and Interdisciplinary Minor",
    "Computer Science Courses",
    "Requirements",
    "Cultural Diversity Requirement",
  ])("%j is not an offering", (name) => {
    expect(classifyHeading(name, "Some Department", false)).toBeNull();
  });
});

describe("parseProgramDetail grouping rules", () => {
  it("opens up a wrapper core that contains the offerings", () => {
    const detail = page("German Studies", [
      core("Language Requirement", "<p>German 201 meets the language requirement.</p>"),
      core("German Studies", "", {
        children: [
          core("Placement", "<p>Take the placement test.</p>"),
          core(
            "Major Requirements (A.B. Degree)",
            "<p>Ten courses are required, including German 202, 301, 302.</p>",
          ),
          core("Minor Requirements", REQUIRES),
          core("Honors Requirements", "<p>Write a thesis.</p>"),
        ],
      }),
    ]);
    const result = offerings(detail);
    expect(result.map((o) => o.name)).toEqual([
      "Major in German Studies (A.B. Degree)",
      "Minor in German Studies",
    ]);
    // No course list on the page, so "German 202" is not mapped to a prefix.
    expect(result[0]?.courseCodes).toEqual([]);
  });

  it("splits a core that heads several majors or minors, leaving out ones that have their own page", () => {
    const detail = page("Classics", [
      core(
        "Major Requirements (A.B. Degree)",
        "<p>The department offers two majors.</p><p><strong>Major in Classical Languages and Literature</strong></p>" +
          "<p>A major requires ten courses, including CLA 480.</p><p><strong>Major in Classical Studies</strong></p>" +
          "<p>A major in classical studies requires ten courses.</p>",
      ),
      core(
        "Minor Requirements",
        "<p>The department offers three minors.</p><p>Minor in Greek</p><p>A minor in Greek requires 6 courses.</p>" +
          "<p>Minor in Latin</p><p>A minor in Latin requires 6 courses.</p><p>Minor in Classical Studies</p>" +
          "<p>A minor in classical studies requires six courses.</p>",
      ),
      core("Placement", "<p>Greek placement.</p>"),
    ]);
    const result = offerings(detail, ["Classics", "Greek", "Latin"]);
    expect(result.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: "major", name: "Major in Classical Languages and Literature (A.B. Degree)" },
      { kind: "major", name: "Major in Classical Studies (A.B. Degree)" },
      { kind: "minor", name: "Minor in Classical Studies" },
    ]);
    expect(result[0]?.sections).toEqual([
      { heading: "Major Requirements (A.B. Degree)", text: "The department offers two majors." },
      {
        heading: "Major in Classical Languages and Literature",
        text: "A major requires ten courses, including CLA 480.",
      },
    ]);
    expect(result[0]?.courseCodes).toEqual(["CLA 480"]);
  });

  it("joins track cores to the page's offering of the same kind, or starts it", () => {
    const appliedMath = page(
      "Applied Mathematics",
      [
        core("Minor Requirements - Social Science Track", "<p>Social science track.</p>", {
          children: [
            core("One course selected from:", "", {
              courses: [{ id: 1, title: "MAT 150 - Linear Algebra" }],
            }),
          ],
        }),
        core("Minor Requirements - Natural Science Track", "<p>Natural science track.</p>", {
          children: [
            core("Physics", "", { courses: [{ id: 2, title: "PHY 130 - General Physics" }] }),
          ],
        }),
        core("Additional Information", "<p>Ask the chair.</p>"),
      ],
      { types: ["Interdisciplinary Minors"] },
    );
    const [minor, ...rest] = offerings(appliedMath);
    expect(rest).toEqual([]);
    expect(minor?.name).toBe("Interdisciplinary Minor in Applied Mathematics");
    expect(minor?.sections.map((s) => s.heading)).toEqual([
      "Minor Requirements - Social Science Track",
      "One course selected from:",
      "Minor Requirements - Natural Science Track",
      "Physics",
    ]);
    expect(minor?.courseCodes).toEqual(["MAT 150", "PHY 130"]);

    const physics = page("Physics", [
      core("Major Requirements (B.S. Degree)", "<p>The major requires PHY 305.</p>"),
      core("Major Requirements (Engineering Dual Degree (3-2) Track)", "<p>Take PHY 315.</p>"),
      core("Minor in Astrophysics Requirements", "<p>The minor requires six courses.</p>"),
    ]);
    const result = offerings(physics);
    expect(result.map((o) => o.name)).toEqual([
      "Major in Physics (B.S. Degree)",
      "Minor in Astrophysics",
    ]);
    expect(result[0]?.courseCodes).toEqual(["PHY 305", "PHY 315"]);
  });

  it("leaves out offerings that live on another page and pointers without requirements", () => {
    const detail = page("Physics", [
      core("Major Requirements (B.S. Degree)", "<p>The major requires PHY 305.</p>"),
      core("Honors Requirements", "<p>Thesis.</p>"),
      core(
        "Applied Mathematics Interdisciplinary Minor",
        "<p>See Applied Mathematics; it requires MAT 150.</p>",
      ),
      core("Computer Science", "<p>Physics majors often take CSC 121.</p>"),
    ]);
    const result = offerings(detail, ["Physics", "Applied Mathematics"]);
    expect(result.map((o) => o.name)).toEqual(["Major in Physics (B.S. Degree)"]);
    expect(result[0]?.courseCodes).toEqual(["PHY 305"]);

    const arab = page("Arab Studies", [
      core("Minor Requirements", "<p>A minor in Arab Studies requires six courses.</p>"),
      core(
        "Interdisciplinary Minor in Middle East Studies",
        "<p>Students should note as well the possibility of a focus on the Middle East through an interdisciplinary minor in Middle East Studies.</p>",
      ),
    ]);
    expect(offerings(arab).map((o) => o.name)).toEqual(["Minor in Arab Studies"]);
  });

  it("gives a page without offering headings one offering from its 'Requirements' core", () => {
    const dance = page("Dance", [
      core(
        "Requirements",
        "<p>A minor in Dance Studies requires 6 courses, including Dance 101.</p>",
      ),
      core("Basic Structure of the Minor", "<p>One Introductory Course</p>", {
        courses: [{ id: 3, title: "DAN 101 - Introduction to Dance" }],
      }),
      core("Rationale for Course Numbering", "<p>Levels.</p>"),
      core("Dance Courses", "", {
        courses: [
          { id: 4, title: "DAN 101 - Introduction to Dance" },
          { id: 5, title: "DAN 201 - Ballet" },
          { id: 6, title: "DAN 301 - Modern" },
        ],
      }),
    ]);
    const [minor] = offerings(dance);
    expect(minor).toMatchObject({ kind: "minor", name: "Minor in Dance" });
    expect(minor?.sections.map((s) => s.heading)).toEqual([
      "Requirements",
      "Basic Structure of the Minor",
    ]);
    expect(minor?.courseCodes).toEqual(["DAN 101"]);

    const digital = page(
      "Digital Studies",
      [
        core("Requirements", "<p>Six courses, including DIG 101.</p>"),
        core("Application Procedure", "<p>Meet the chair.</p>"),
      ],
      {
        types: ["Interdisciplinary Minors"],
      },
    );
    expect(offerings(digital)).toMatchObject([
      { kind: "interdisciplinary-minor", name: "Interdisciplinary Minor in Digital Studies" },
    ]);
    expect(offerings(digital)[0]?.sections.map((s) => s.heading)).toEqual([
      "Requirements",
      "Application Procedure",
    ]);

    expect(
      offerings(page("Writing", [core("Requirements", "<p>Every student takes WRI 101.</p>")])),
    ).toEqual([]);
    expect(offerings(page("Humanities", [core("Overview", "<p>HUM 103.</p>")]))).toEqual([]);
  });

  it("attaches following sections to an offering until the next offering or a department-wide section", () => {
    const detail = page("East Asian Studies", [
      core("East Asian Studies Major (A.B. Degree)", "<p>Ten courses.</p>"),
      core("History Survey Courses (2)", "", {
        courses: [
          { id: 7, title: "HIS 183 - East Asian History to 1850" },
          { id: 8, title: "HIS 184 - Modern East Asia" },
        ],
      }),
      core("Immersion Requirement", "<p>A semester abroad.</p>"),
      core("Honors", "<p>Honors thesis.</p>"),
      core("Notes", "<p>Unattached notes.</p>"),
      core("East Asian Studies Interdisciplinary Minor", "<p>Open to all.</p>"),
      core("(1) Six courses, including", "", {
        courses: [{ id: 9, title: "CHI 120 - Chinese Culture" }],
      }),
      core("Notes", "<p>No more than two 100-level courses.</p>"),
      core("East Asian Studies Courses", "", {
        courses: [
          { id: 10, title: "EAS 101 - Intro" },
          { id: 11, title: "EAS 201 - More" },
          { id: 12, title: "EAS 301 - Most" },
        ],
      }),
    ]);
    const [major, minor] = offerings(detail);
    expect(major?.sections.map((s) => s.heading)).toEqual([
      "East Asian Studies Major (A.B. Degree)",
      "History Survey Courses (2)",
      "Immersion Requirement",
    ]);
    expect(major?.courseCodes).toEqual(["HIS 183", "HIS 184"]);
    expect(minor?.name).toBe("Interdisciplinary Minor in East Asian Studies");
    expect(minor?.sections.map((s) => s.heading)).toEqual([
      "East Asian Studies Interdisciplinary Minor",
      "(1) Six courses, including",
      "Notes",
    ]);
    expect(requirementsTextOf(minor?.sections ?? [])).toBe(
      "East Asian Studies Interdisciplinary Minor\nOpen to all.\n\n(1) Six courses, including\n- CHI 120 - Chinese Culture\n\nNotes\nNo more than two 100-level courses.",
    );
  });

  it("skips hidden cores and courses, and merges a repeated generic heading into one offering", () => {
    const detail = page("History", [
      core("Major Requirements (A.B. Degree)", "<p>Ten courses, including HIS 101.</p>", {
        courses: [
          { id: 13, title: "HIS 102 - Shown" },
          { id: 14, title: "HIS 103 - Hidden", status: { active: true, visible: false } },
        ],
      }),
      core("Major Requirements (A.B. Degree)", "<p>Also required: HIS 490.</p>"),
      core("Minor Requirements", "<p>Old minor, six courses.</p>", {
        status: { active: false, visible: true },
      }),
    ]);
    const result = offerings(detail);
    expect(result).toHaveLength(1);
    expect(result[0]?.courseCodes).toEqual(["HIS 101", "HIS 102", "HIS 490"]);
  });
});

describe("courseCodesIn", () => {
  it("normalises, de-duplicates and keeps the order of first mention", () => {
    expect(
      courseCodesIn("Take ARB496 or CSC 121, then CSC 121L and CSC 121 again (= BIO 209)."),
    ).toEqual(["ARB 496", "CSC 121", "CSC 121L", "BIO 209"]);
  });

  it("ignores words that are not course prefixes and numbers that are not course numbers", () => {
    expect(courseCodesIn("A GPA 300 or SAT 1400; CEFR B2; US 101; PHY 1000; MAT 11")).toEqual([]);
  });

  it("reads a page's own subject word, including runs of numbers after it", () => {
    const aliases = [{ word: "Physics", prefix: "PHY" }];
    expect(
      courseCodesIn(
        "Physics 120, 125 or 130 is a prerequisite; Physics 230 and 235; physics 999",
        aliases,
      ),
    ).toEqual(["PHY 120", "PHY 125", "PHY 130", "PHY 230", "PHY 235"]);
  });

  it("learns the page's prefix from its course lists (three courses or more)", () => {
    const withList = [
      core("Courses", "", {
        courses: [
          { id: 20, title: "ECO 101 - Principles" },
          { id: 21, title: "ECO 202 - Micro" },
          { id: 22, title: "MAT 110 - Calculus" },
          { id: 23, title: "ECO 203 - Macro" },
        ],
      }),
    ];
    expect(pagePrefix(withList)).toBe("ECO");
    expect(
      pagePrefix([core("Courses", "", { courses: [{ id: 24, title: "ECO 101 - Principles" }] })]),
    ).toBeNull();
  });
});
