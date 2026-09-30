import { describe, expect, it } from "vitest";
import { CourseCodeSchema } from "@/lib/types/common";
import { MISSING_COURSE } from "@/server/programs/html";
import {
  classifyHeading,
  familiesNamed,
  pagePrefix,
  type ParsedProgram,
  parseProgramDetail,
  requirementsTextOf,
} from "@/server/programs/parse";
import { type AcalogCore, AcalogProgramDetailSchema } from "@/server/programs/upstream";
import { PUBLIC_NAMES, recordedPage, recordedPages } from "./recorded";

let nextId = 1;
function core(name: string, description = "", extra: Partial<AcalogCore> = {}): AcalogCore {
  const id = nextId++;
  return { id, name, description, courses: [], adhocs: [], children: [], sort_order: id, ...extra };
}

function courses(...titles: string[]): AcalogCore["courses"] {
  return titles.map((title) => ({ id: nextId++, title }));
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

function parsed(detail: ReturnType<typeof page>, otherProgramNames: string[] = []) {
  return parseProgramDetail(detail, { otherProgramNames });
}

function offerings(detail: ReturnType<typeof page>, otherProgramNames: string[] = []) {
  return parsed(detail, otherProgramNames).offerings;
}

const headings = (sections: readonly { heading: string }[] = []) => sections.map((s) => s.heading);

const REQUIRES = "<p>The minor requires six courses.</p>";

// ---- The recorded catalog ----------------------------------------------------------------------------------------

const cache = new Map<number, ParsedProgram>();
function recorded(id: number): ParsedProgram {
  let result = cache.get(id);
  if (!result) {
    result = parseProgramDetail(recordedPage(id), { otherProgramNames: PUBLIC_NAMES });
    cache.set(id, result);
  }
  return result;
}

function offering(id: number, name: string) {
  const found = recorded(id).offerings.find((o) => o.name === name);
  if (!found) throw new Error(`${id} has no offering ${name}`);
  return { ...found, text: requirementsTextOf(found.sections) };
}

describe("parseProgramDetail on the recorded catalog pages", () => {
  it("Computer Science (172): the B.S. major and the minor, with text and the codes it names", () => {
    const result = recorded(172);
    expect(result).toMatchObject({
      acalogId: 172,
      legacyId: 1799,
      name: "Computer Science",
      code: "CS",
      modified: "2026-09-15 15:03:36",
    });
    expect(result.offerings.map(({ kind, name, degree }) => ({ kind, name, degree }))).toEqual([
      { kind: "major", name: "Major in Computer Science (B.S. Degree)", degree: "B.S." },
      { kind: "minor", name: "Minor in Computer Science", degree: null },
    ]);
    const major = offering(172, "Major in Computer Science (B.S. Degree)");
    expect(major.courseCodes).toEqual(["MAT 230", "CSC 221", "CSC 381", "CSC 382", "CSC 383"]);
    expect(
      major.text.startsWith("Major in Computer Science (B.S. Degree)\nMajor Prerequisites:\n"),
    ).toBe(true);
    expect(major.text).toContain(
      "MAT 230 and CSC 221 should be completed before spring of the junior year.",
    );
    expect(major.text).toContain("- Advanced placement credit for Computer Science A");
    // Acalog's unlinked course links (see server/programs/html.ts) are counted, not hidden.
    expect(major.missingCourseRefs).toBe(40);
    expect(major.text.split(MISSING_COURSE).length - 1).toBe(40);
    expect(offering(172, "Minor in Computer Science").courseCodes).toEqual([
      "CSC 381",
      "CSC 382",
      "CSC 383",
    ]);
    // Department sections (graduate school, honors, the course catalog list) are the page's, not an offering's.
    expect(result.offerings.flatMap((o) => headings(o.sections))).toEqual([
      "Major in Computer Science (B.S. Degree)",
      "Minor in Computer Science",
    ]);
    expect(headings(result.pageSections)).toEqual([
      "Graduate Studies in Computer Science",
      "Honors in Computer Science",
      "Computer Science Courses",
    ]);
    expect(result.descriptionText).toMatch(/^Professors: /);
  });

  it("Economics (174): generic headings take the page's name; 'Economics 202' counts as ECO 202", () => {
    const result = recorded(174);
    expect(result.offerings.map(({ kind, name, degree }) => ({ kind, name, degree }))).toEqual([
      { kind: "major", name: "Major in Economics (A.B. Degree)", degree: "A.B." },
      { kind: "minor", name: "Minor in Economics", degree: null },
    ]);
    // "with the exceptions of Economics 180-184, 195, 199, and 494" names 195 and 494 (both courses), not the
    // range bounds; "of Economics 211-214, only two may be used" is a range.
    expect(result.offerings[0]?.courseCodes).toEqual([
      "ECO 101",
      "ECO 202",
      "ECO 203",
      "ECO 204",
      "ECO 205",
      "ECO 495",
      "ECO 195",
      "ECO 494",
    ]);
    const minorText = offering(174, "Minor in Economics").text;
    expect(minorText).toContain("3. Economics 202 and Economics 203;");
    expect(minorText).toContain(`2. ${MISSING_COURSE} or Economics 205;`);
  });

  it("Mathematics (188): the B.S. major and the minor", () => {
    const result = recorded(188);
    expect(result.offerings.map((o) => o.name)).toEqual([
      "Major in Mathematics (B.S. Degree)",
      "Minor in Mathematics",
    ]);
    expect(result.offerings[0]?.courseCodes).toEqual([
      "MAT 113",
      "MAT 150",
      "MAT 160",
      "MAT 230",
      "MAT 315",
      "MAT 330",
      "MAT 355",
    ]);
    expect(result.offerings[0]?.missingCourseRefs).toBe(0);
  });

  it("produces contract-valid course codes and text without markup on every page", () => {
    for (const id of recordedPages().keys()) {
      for (const o of recorded(id).offerings) {
        for (const code of o.courseCodes) expect(CourseCodeSchema.parse(code)).toBe(code);
        const text = requirementsTextOf(o.sections);
        expect(text).not.toMatch(/<\/?[a-z]/i);
        expect(text).not.toMatch(/&(?:amp|nbsp|#\d+);/);
      }
    }
  });

  it("drops nothing: every visible core of every page is in an offering or in the page's sections", () => {
    const missing: string[] = [];
    for (const [id, detail] of recordedPages()) {
      const result = recorded(id);
      const seen = new Set(
        [...result.offerings.flatMap((o) => o.sections), ...result.pageSections].map(
          (s) => s.heading,
        ),
      );
      const visit = (cores: readonly AcalogCore[]) => {
        for (const c of cores) {
          if (c.status && !(c.status.active && c.status.visible)) continue;
          const heading = c.name.replace(/\s+/g, " ").trim();
          // A heading-only wrapper around offerings ("German Studies") is opened up, not a section.
          const wrapper = heading === "German Studies" && id === 181;
          if (!wrapper && !seen.has(heading)) missing.push(`${id} ${c.id} ${heading}`);
          visit(c.children);
        }
      };
      if (result.offerings.length > 0 || result.pageSections.length > 0) visit(detail.cores);
    }
    expect(missing).toEqual([]);
  });
});

describe("sections the parser used to drop (review of W1b, recorded pages)", () => {
  it("Physics (195): the mathematics and computational physics requirements before the major heading", () => {
    const major = offering(195, "Major in Physics (B.S. Degree)");
    expect(major.text).toContain(
      "the mathematics requirement; the computational physics requirement",
    );
    expect(major.text).toContain(
      "Mathematics Requirement\nEither Physics 250 or both Mathematics 150 and 160 will satisfy the mathematics requirement for the Physics major and Astrophysics minor.",
    );
    expect(major.text).toContain(
      "Computational Physics\nThe computational physics requirement may be satisfied in one of two ways: (1) PHY 240 or (2) MAT/CSC 315",
    );
    // "… for the Physics major and Astrophysics minor": that minor too, not Applied Physics.
    expect(headings(offering(195, "Minor in Astrophysics").sections)).toContain(
      "Mathematics Requirement",
    );
    expect(headings(offering(195, "Minor in Applied Physics").sections)).toEqual([
      "Minor in Applied Physics Requirements",
    ]);
    expect(major.courseCodes).toEqual(
      expect.arrayContaining(["PHY 220", "PHY 225", "PHY 330", "PHY 350", "PHY 360", "PHY 240"]),
    );
  });

  it("Theatre (203): 'Production Requirements for Majors and Minors' joins both", () => {
    for (const name of ["Major in Theatre (A.B. Degree)", "Minor in Theatre"]) {
      const o = offering(203, name);
      expect(o.text).toContain("complete one production experience");
      expect(o.text).toContain("Production Requirements for Majors and Minors\nTHE 050:");
      expect(o.courseCodes).toContain("THE 050");
    }
    // "… as credit toward the major": the transfer rule is the major's.
    expect(headings(offering(203, "Major in Theatre (A.B. Degree)").sections)).toContain(
      "Transfer Courses",
    );
    expect(headings(offering(203, "Minor in Theatre").sections)).not.toContain("Transfer Courses");
  });

  it("FMDS (213): 'Notes' after the honors section stays with the major", () => {
    const major = offering(213, "Major in Film, Media, and Digital Studies (A.B. Degree)");
    expect(major.text).toContain(
      "Notes\n- A maximum of two courses may count toward both the Film, Media and Digital Studies major and a second major or minor",
    );
    expect(headings(offering(213, "Minor in Film and Media Studies").sections)).not.toContain(
      "Notes",
    );
  });

  it("Applied Mathematics (163): 'Additional Information', the Natural Science track heading, both 'One course selected from' blocks", () => {
    const minor = offering(163, "Interdisciplinary Minor in Applied Mathematics");
    expect(minor.text).toContain("Additional Information\n");
    expect(minor.text).toMatch(/grade of "?C"?/);
    const list = headings(minor.sections);
    // Four in the Social Science track, two in the Natural Science track (one with the same text as the first).
    expect(list.filter((h) => h === "One course selected from:")).toHaveLength(6);
    const natural = list.indexOf("Minor Requirements - Natural Science Track");
    expect(natural).toBeGreaterThan(list.indexOf("Two electives selected from:"));
    expect(list[natural + 1]).toBe("One course selected from:");
    expect(list[natural + 2]).toBe("Linear Algebra");
  });

  it("LALCS (187): the methods requirement and the electives list join the major (and the minor)", () => {
    const major = offering(
      187,
      "Major in Latin American, Latinx, and Caribbean Studies (A.B. Degree)",
    );
    const minor = offering(187, "Interdisciplinary Minor in Latin American Studies");
    for (const heading of [
      "Methods requirement",
      "Electives counting toward the LAS Major and Interdisciplinary Minor",
      "Non-LAS-Prefixed Methods Courses for the LAS Major",
    ]) {
      expect(headings(major.sections), heading).toContain(heading);
    }
    expect(headings(minor.sections)).toContain(
      "Electives counting toward the LAS Major and Interdisciplinary Minor",
    );
    expect(major.courseCodes.length).toBeGreaterThan(40);
  });

  it("Communication Studies (171): the course lists within and outside the department", () => {
    const major = offering(171, "Major in Communication Studies (A.B. Degree)");
    expect(headings(major.sections)).toEqual(
      expect.arrayContaining([
        "Courses Within Communication Studies",
        "Courses Outside Communication Studies",
      ]),
    );
    // "… majors are free to choose two electives from other … fields": outside electives are the major's.
    expect(headings(offering(171, "Minor in Communication Studies").sections)).toEqual([
      "Minor Requirements",
      "Courses Within Communication Studies",
    ]);
  });

  it("Africana Studies (207): the category lists and the portfolio rules join both offerings", () => {
    for (const name of ["Major in Africana Studies (A.B. Degree)", "Minor in Africana Studies"]) {
      const o = offering(207, name);
      expect(headings(o.sections)).toEqual(
        expect.arrayContaining([
          "Categories",
          "Cultural Production and Expression Courses",
          "Africana Major and Minor Portfolios",
        ]),
      );
      expect(o.text).toContain("Majors must submit at least four items and minors at least two");
      expect(o.courseCodes.length).toBeGreaterThan(20);
    }
  });

  it("Global Literary Theory (208): the minor's approved theory and literature lists", () => {
    const minor = offering(208, "Interdisciplinary Minor in Global Literary Theory");
    expect(headings(minor.sections)).toEqual([
      "Minor Requirements",
      "Theory Courses",
      "Literature Courses",
    ]);
    expect(minor.courseCodes.length).toBeGreaterThan(100);
    // The major has its own theory list; it does not get the minor's.
    expect(
      headings(offering(208, "Major in Global Literary Theory (A.B. Degree)").sections),
    ).not.toContain("Theory Courses");
  });

  it("Educational Studies (175), ENV (177): pillar and track course lists after the numbering rationale", () => {
    for (const name of [
      "Major in Educational Studies (A.B. Degree)",
      "Minor in Educational Studies",
    ]) {
      expect(offering(175, name).text).toContain(
        "Curriculum\n\nCurriculum\n1. Historical and Philosophical Foundations\n",
      );
    }
    for (const name of [
      "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)",
      "Interdisciplinary Minor in Environmental Studies",
    ]) {
      const o = offering(177, name);
      expect(headings(o.sections)).toContain("Environmental Natural Sciences Courses");
      expect(o.text).toContain("- ANT 273 - Bioarchaeology (for Depth Component only)");
    }
  });

  it("History (183): pre-college credit, which counts toward the major only", () => {
    expect(offering(183, "Major in History (A.B. Degree)").text).toContain(
      "Pre-College Credit\nStudents may receive one elective course credit",
    );
    expect(headings(offering(183, "Minor in History").sections)).toEqual(["Minor Requirements"]);
  });

  it("Hispanic Studies (202): the major's 'See Hispanic Studies Humanities Section below'", () => {
    for (const name of ["Major in Hispanic Studies (A.B. Degree)", "Minor in Hispanic Studies"]) {
      expect(headings(offering(202, name).sections)).toContain("Hispanic Humanities");
    }
    expect(offering(202, "Major in Hispanic Studies (A.B. Degree)").courseCodes).toEqual(
      expect.arrayContaining(["SPA 271", "SPA 272"]),
    );
  });

  it("keeps the course catalog, honors and what follows the catalog on the page (French 179)", () => {
    const result = recorded(179);
    expect(result.offerings.flatMap((o) => headings(o.sections))).toEqual([
      "Major Requirements (A.B. Degree)",
      "Minor Requirements",
    ]);
    expect(headings(result.pageSections)).toEqual(
      expect.arrayContaining([
        "Honors Requirements",
        "French and Francophone Studies Courses",
        "Seminars",
      ]),
    );
    expect(result.offerings[0]?.courseCodes).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^FRE 3[1-8]0$/)]),
    );
  });

  it("an offering another page owns keeps its text on this page (FMDS 213's Digital Studies minor)", () => {
    const result = recorded(213);
    expect(result.offerings.map((o) => o.name)).not.toContain("Minor in Digital Studies");
    expect(headings(result.pageSections)).toContain("Digital Studies Minor Requirements");
    expect(result.elsewhere).toEqual([
      expect.objectContaining({
        family: "minor",
        subjectKey: "digital studies",
        name: "Minor in Digital Studies",
        text: expect.stringContaining(
          "Digital Studies Minor Requirements\nThe Digital Studies Interdisciplinary minor requires six courses",
        ),
      }),
    ]);
  });
});

describe("Acalog adhoc text and heading-only cores (recorded pages)", () => {
  it("East Asian Studies (210): 'A. Either … OR … B. Five other courses' in place, and requirement (3)", () => {
    const minor = offering(210, "Interdisciplinary Minor in East Asian Studies");
    expect(minor.text).toContain(
      [
        "(1) Six courses, including",
        "A. Either",
        "- CHI 120 - Introduction to Chinese Culture (in translation)",
        "OR",
        "- CHI 122 - Introduction to Chinese Visual Culture (in translation)",
        "OR",
        "- HIS 183 - East Asian History to 1850",
        "OR",
        "- HIS 184 - Modern East Asia",
        "B. Five other courses, drawn from the list below or approved by the Director of the East Asian Studies interdisciplinary minor.",
      ].join("\n"),
    );
    expect(minor.sections).toContainEqual({
      heading: "(3) An international Experience in East Asia of at least one month's duration",
      text: "",
    });
    expect(minor.text).toContain(
      "\n\n(3) An international Experience in East Asia of at least one month's duration\n\nNotes\n",
    );
  });

  it("Arab Studies (164), GSS (205), GLT (208), Data Science (212): adhocs before, after and right of courses", () => {
    expect(offering(164, "Major in Arab Studies (A.B. Degree)").text).toContain(
      "Any 200-level History course. (HIS 218 is recommended.)\n- HIS 218 - Jihad and Crusade",
    );
    const gss = offering(205, "Major in Gender and Sexuality Studies (A.B. Degree)").text;
    expect(gss).toContain("Only SPA 403, Latino American Sexualities, will count toward the major");
    expect(gss).toContain(
      "Only THE 383, Current Trends in Theatre Studies, will count towards the methods courses",
    );
    expect(offering(208, "Interdisciplinary Minor in Global Literary Theory").text).toContain(
      "Or another theory course not listed here with approval of the Global Literary Theory adviser.",
    );
    const data = offering(212, "Interdisciplinary Minor in Data Science").text;
    expect(data).toContain("- CSC 110 - Data Science and Society *");
    expect(data).toContain("- BIO 151 - Use and Misuse of Data in Biology *");
    expect(data).toContain("the student can appeal to the minor coordinator");
  });
});

describe("courseCodes on the recorded pages", () => {
  it("reads bare course numbers on department pages (Philosophy 193)", () => {
    expect(offering(193, "Major in Philosophy (A.B. Degree)").courseCodes).toEqual([
      "PHI 105",
      "PHI 106",
      "PHI 107",
      "PHI 108",
      "PHI 102",
      "PHI 200",
      "PHI 215",
      "PHI 451",
    ]);
    expect(offering(193, "Minor in Philosophy").courseCodes).toEqual([
      "PHI 105",
      "PHI 106",
      "PHI 107",
    ]);
  });

  it("reads no range bounds or thresholds as courses", () => {
    const all = (id: number) => recorded(id).offerings.flatMap((o) => o.courseCodes);
    expect(all(179)).not.toEqual(expect.arrayContaining(["FRE 310"]));
    for (const code of ["FRE 330", "FRE 340", "FRE 350", "FRE 370", "FRE 381"]) {
      expect(all(179)).not.toContain(code);
    }
    expect(all(196)).not.toContain("POL 120");
    expect(all(196)).not.toContain("POL 160");
    expect(all(182)).not.toContain("GRE 200");
    expect(all(186)).not.toContain("LAT 200");
    expect(all(174)).not.toContain("ECO 180");
  });
});

// ---- Rules on synthetic pages ------------------------------------------------------------------------------------

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

describe("familiesNamed", () => {
  it.each([
    ["Production Requirements for Majors and Minors", {}, ["major", "minor"]],
    ["Non-LAS-Prefixed Methods Courses for the LAS Major", {}, ["major"]],
    ["Basic Structure of the Minor", {}, ["minor"]],
    ["Students majoring or minoring in Russian Studies", { inflected: true }, ["major", "minor"]],
    ["Students majoring in Russian Studies", {}, []],
    ["Notes", {}, []],
  ] as const)("%j → %j", (text, options, families) => {
    expect(familiesNamed(text, options)).toEqual(families);
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
    const result = parsed(detail);
    expect(result.offerings.map((o) => o.name)).toEqual([
      "Major in German Studies (A.B. Degree)",
      "Minor in German Studies",
    ]);
    // No course list on the page, so "German 202" is not mapped to a prefix.
    expect(result.offerings[0]?.courseCodes).toEqual([]);
    expect(headings(result.pageSections)).toEqual([
      "Language Requirement",
      "Placement",
      "Honors Requirements",
    ]);
  });

  it("splits a core that heads several majors or minors; ones that have their own page stay on the page", () => {
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
    const result = parsed(detail, ["Classics", "Greek", "Latin"]);
    expect(result.offerings.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: "major", name: "Major in Classical Languages and Literature (A.B. Degree)" },
      { kind: "major", name: "Major in Classical Studies (A.B. Degree)" },
      { kind: "minor", name: "Minor in Classical Studies" },
    ]);
    expect(result.offerings[0]?.sections).toEqual([
      { heading: "Major Requirements (A.B. Degree)", text: "The department offers two majors." },
      {
        heading: "Major in Classical Languages and Literature",
        text: "A major requires ten courses, including CLA 480.",
      },
    ]);
    expect(result.offerings[0]?.courseCodes).toEqual(["CLA 480"]);
    expect(result.elsewhere.map((e) => [e.name, e.subjectKey, e.text])).toEqual([
      [
        "Minor in Greek",
        "greek",
        "Minor Requirements\nThe department offers three minors.\n\nMinor in Greek\nA minor in Greek requires 6 courses.",
      ],
      [
        "Minor in Latin",
        "latin",
        "Minor Requirements\nThe department offers three minors.\n\nMinor in Latin\nA minor in Latin requires 6 courses.",
      ],
    ]);
    expect(headings(result.pageSections)).toEqual([
      "Minor Requirements",
      "Minor in Greek",
      "Minor in Latin",
      "Placement",
    ]);
  });

  it("joins track cores to the page's offering of the same kind, heading included, or starts it", () => {
    const appliedMath = page(
      "Applied Mathematics",
      [
        core("Minor Requirements - Social Science Track", "<p>Social science track.</p>", {
          children: [
            core("One course selected from:", "", { courses: courses("MAT 150 - Linear Algebra") }),
          ],
        }),
        core("Minor Requirements - Natural Science Track", "", {
          children: [
            core("One course selected from:", "", { courses: courses("MAT 150 - Linear Algebra") }),
            core("Physics", "", { courses: courses("PHY 130 - General Physics") }),
          ],
        }),
        core("Additional Information", "<p>Ask the chair.</p>"),
      ],
      { types: ["Interdisciplinary Minors"] },
    );
    const [minor, ...rest] = offerings(appliedMath);
    expect(rest).toEqual([]);
    expect(minor?.name).toBe("Interdisciplinary Minor in Applied Mathematics");
    expect(minor?.sections).toEqual([
      { heading: "Minor Requirements - Social Science Track", text: "Social science track." },
      { heading: "One course selected from:", text: "- MAT 150 - Linear Algebra" },
      { heading: "Minor Requirements - Natural Science Track", text: "" },
      // The same heading and text again, from another core: kept (one per Acalog core, not per text).
      { heading: "One course selected from:", text: "- MAT 150 - Linear Algebra" },
      { heading: "Physics", text: "- PHY 130 - General Physics" },
      { heading: "Additional Information", text: "Ask the chair." },
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

  it("keeps offerings that live on another page, and pointers, on the page only", () => {
    const detail = page("Physics", [
      core("Major Requirements (B.S. Degree)", "<p>The major requires PHY 305.</p>"),
      core("Honors Requirements", "<p>Thesis.</p>"),
      core(
        "Applied Mathematics Interdisciplinary Minor",
        "<p>See Applied Mathematics; it requires MAT 150.</p>",
      ),
      core(
        "Computer Science",
        "<p>Physics majors often take CSC 121 (see the Computer Science section).</p>",
      ),
    ]);
    const result = parsed(detail, ["Physics", "Applied Mathematics"]);
    expect(result.offerings.map((o) => o.name)).toEqual(["Major in Physics (B.S. Degree)"]);
    expect(result.offerings[0]?.courseCodes).toEqual(["PHY 305"]);
    expect(headings(result.pageSections)).toEqual([
      "Honors Requirements",
      "Applied Mathematics Interdisciplinary Minor",
      "Computer Science",
    ]);

    const arab = parsed(
      page("Arab Studies", [
        core("Minor Requirements", "<p>A minor in Arab Studies requires six courses.</p>"),
        core(
          "Interdisciplinary Minor in Middle East Studies",
          "<p>Students should note as well the possibility of a focus on the Middle East through an interdisciplinary minor in Middle East Studies.</p>",
        ),
      ]),
    );
    expect(arab.offerings.map((o) => o.name)).toEqual(["Minor in Arab Studies"]);
    expect(headings(arab.pageSections)).toEqual(["Interdisciplinary Minor in Middle East Studies"]);
    expect(arab.elsewhere).toEqual([]);
  });

  it("gives a page without offering headings one offering from its 'Requirements' core", () => {
    const dance = parsed(
      page("Dance", [
        core(
          "Requirements",
          "<p>A minor in Dance Studies requires 6 courses, including Dance 101.</p>",
        ),
        core("Basic Structure of the Minor", "<p>One Introductory Course</p>", {
          courses: courses("DAN 101 - Introduction to Dance"),
        }),
        core("Rationale for Course Numbering", "<p>Levels.</p>"),
        core("Dance Courses", "", {
          courses: courses(
            "DAN 101 - Introduction to Dance",
            "DAN 201 - Ballet",
            "DAN 240 - Modern",
            "DAN 301 - Composition",
            "DAN 340 - Repertory",
          ),
        }),
      ]),
    );
    const [minor] = dance.offerings;
    expect(minor).toMatchObject({ kind: "minor", name: "Minor in Dance" });
    expect(headings(minor?.sections)).toEqual(["Requirements", "Basic Structure of the Minor"]);
    expect(minor?.courseCodes).toEqual(["DAN 101"]);
    expect(headings(dance.pageSections)).toEqual([
      "Rationale for Course Numbering",
      "Dance Courses",
    ]);

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
    expect(headings(offerings(digital)[0]?.sections)).toEqual([
      "Requirements",
      "Application Procedure",
    ]);

    const writing = parsed(
      page("Writing", [core("Requirements", "<p>Every student takes WRI 101.</p>")]),
    );
    expect(writing.offerings).toEqual([]);
    expect(headings(writing.pageSections)).toEqual(["Requirements"]);
    expect(offerings(page("Humanities", [core("Overview", "<p>HUM 103.</p>")]))).toEqual([]);
  });

  it("attaches following sections to an offering, also past department information while more offerings follow", () => {
    const detail = page("East Asian Studies", [
      core("East Asian Studies Major (A.B. Degree)", "<p>Ten courses.</p>"),
      core("History Survey Courses (2)", "", {
        courses: courses("HIS 183 - East Asian History to 1850", "HIS 184 - Modern East Asia"),
      }),
      core("Immersion Requirement", "<p>A semester abroad.</p>"),
      core("Honors", "<p>Honors thesis.</p>"),
      core("Notes", "<p>Majors take at most two 100-level courses.</p>"),
      core("East Asian Studies Interdisciplinary Minor", "<p>Open to all.</p>"),
      core("(1) Six courses, including", "", { courses: courses("CHI 120 - Chinese Culture") }),
      core("Notes", "<p>No more than two 100-level courses.</p>"),
      core("East Asian Studies Courses", "", {
        courses: courses(
          "EAS 101 - Intro",
          "EAS 201 - More",
          "EAS 301 - Most",
          "EAS 350 - Topics",
          "EAS 401 - Seminar",
        ),
      }),
    ]);
    const result = parsed(detail);
    const [major, minor] = result.offerings;
    expect(headings(major?.sections)).toEqual([
      "East Asian Studies Major (A.B. Degree)",
      "History Survey Courses (2)",
      "Immersion Requirement",
      "Notes",
    ]);
    expect(major?.courseCodes).toEqual(["HIS 183", "HIS 184"]);
    expect(minor?.name).toBe("Interdisciplinary Minor in East Asian Studies");
    expect(requirementsTextOf(minor?.sections ?? [])).toBe(
      "East Asian Studies Interdisciplinary Minor\nOpen to all.\n\n(1) Six courses, including\n- CHI 120 - Chinese Culture\n\nNotes\nNo more than two 100-level courses.",
    );
    // One prefix, five courses or more: the department's course catalog, not a requirement list.
    expect(headings(result.pageSections)).toEqual(["Honors", "East Asian Studies Courses"]);
  });

  it("gives a section named for majors and/or minors to every offering of those kinds", () => {
    const detail = page("Theatre", [
      core("Major Requirements (A.B. Degree)", "<p>Ten courses and one production experience.</p>"),
      core("Production Requirements for Majors and Minors", "<p>THE 050: 35 backstage hours.</p>"),
      core("Minor Requirements", REQUIRES, {
        children: [core("Methods Courses for the Theatre Major", "<p>THE 380.</p>")],
      }),
    ]);
    const [major, minor] = offerings(detail);
    expect(headings(major?.sections)).toEqual([
      "Major Requirements (A.B. Degree)",
      "Production Requirements for Majors and Minors",
      // Nested in the minor but named for the major: both have it.
      "Methods Courses for the Theatre Major",
    ]);
    expect(headings(minor?.sections)).toEqual([
      "Minor Requirements",
      "Methods Courses for the Theatre Major",
      "Production Requirements for Majors and Minors",
    ]);
    expect(major?.courseCodes).toEqual(["THE 050", "THE 380"]);
  });

  it("gives a section before the first offering to the offerings its text names, else to all", () => {
    const detail = page("Physics", [
      core(
        "Mathematics Requirement",
        "<p>PHY 250 satisfies it for the Physics major and the Astrophysics minor.</p>",
      ),
      core("Computing", "<p>PHY 240 counts once for double majors.</p>"),
      core("Advising", "<p>Talk to the chair.</p>"),
      core(
        "Major Requirements (B.S. Degree)",
        "<p>The major requires PHY 305 and the mathematics requirement.</p>",
      ),
      core("Minor in Astrophysics Requirements", REQUIRES),
      core("Minor in Applied Physics Requirements", REQUIRES),
    ]);
    const [major, astro, applied] = offerings(detail);
    expect(headings(major?.sections)).toEqual([
      "Major Requirements (B.S. Degree)",
      "Mathematics Requirement",
      "Computing",
      "Advising",
    ]);
    expect(headings(astro?.sections)).toEqual([
      "Minor in Astrophysics Requirements",
      "Mathematics Requirement",
      "Advising",
    ]);
    expect(headings(applied?.sections)).toEqual([
      "Minor in Applied Physics Requirements",
      "Advising",
    ]);
  });

  it("gives a section after department information, with no offering after it, to the kinds it names or all", () => {
    const detail = page("Communication Studies", [
      core("Major in Communication Studies (A.B. Degree)", "<p>Ten courses, four from within.</p>"),
      core("Minor Requirements", REQUIRES),
      core("Rationale for Course Numbering", "<p>100-level courses are introductory.</p>"),
      core("Courses Within Communication Studies", "", {
        courses: courses("COM 101 - Principles", "COM 201 - Introduction"),
      }),
      core(
        "Courses Outside Communication Studies",
        "<p>Majors may choose two electives from other fields.</p>",
      ),
    ]);
    const [major, minor] = offerings(detail);
    expect(headings(major?.sections)).toEqual([
      "Major in Communication Studies (A.B. Degree)",
      "Courses Within Communication Studies",
      "Courses Outside Communication Studies",
    ]);
    expect(headings(minor?.sections)).toEqual([
      "Minor Requirements",
      "Courses Within Communication Studies",
    ]);
  });

  it("keeps what follows the department's course catalog on the page", () => {
    const result = parsed(
      page("French", [
        core("Major Requirements (A.B. Degree)", "<p>Nine courses.</p>"),
        core("French Courses", "", {
          courses: courses(
            "FRE 101 - A",
            "FRE 102 - B",
            "FRE 201 - C",
            "FRE 220 - D",
            "FRE 301 - E",
          ),
        }),
        core("Seminars", "", { courses: courses("FRE 401 - F") }),
      ]),
    );
    expect(headings(result.offerings[0]?.sections)).toEqual(["Major Requirements (A.B. Degree)"]);
    expect(headings(result.pageSections)).toEqual(["French Courses", "Seminars"]);
  });

  it("also gives a section to another offering whose text refers to it", () => {
    const detail = page("Hispanic Studies", [
      core(
        "Major Requirements (A.B. Degree)",
        "<p>Ten courses (See Hispanic Studies Humanities Section below).</p>",
      ),
      core("Minor Requirements", "<p>Six courses; study abroad in Spain is recommended.</p>"),
      core("Hispanic Humanities", "<p>SPA 271 and 272 are a sequence.</p>"),
      core("Study Abroad", "<p>Minors may study abroad.</p>"),
    ]);
    const [major, minor] = offerings(detail);
    expect(headings(major?.sections)).toEqual([
      "Major Requirements (A.B. Degree)",
      "Hispanic Humanities",
    ]);
    // A mention ("study abroad … is recommended") is not a reference.
    expect(headings(minor?.sections)).toEqual([
      "Minor Requirements",
      "Hispanic Humanities",
      "Study Abroad",
    ]);
    expect(major?.courseCodes).toEqual(["SPA 271", "SPA 272"]);
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

  it("places adhoc text before, after and right of its course; leftovers after the list; a hidden course's adhocs hidden", () => {
    const [a, b, c, hidden] = [nextId++, nextId++, nextId++, nextId++];
    const detail = page("East Asian Studies", [
      core("Minor Requirements", REQUIRES, {
        courses: [
          { id: a, title: "CHI 120 - Chinese Culture" },
          { id: b, title: "CHI 122 - Visual Culture" },
          { id: hidden, title: "CHI 199 - Retired", status: { active: true, visible: false } },
          { id: c, title: "HIS 183 - East Asia" },
        ],
        adhocs: [
          { content: "<p>A. Either</p>", placement: "before", "course-id": a },
          { content: "<p>OR</p>", placement: "after", "course-id": a },
          { content: "<p><strong>*</strong></p>", placement: "right", "course-id": b },
          { content: "<p>OR</p>", placement: "after", "course-id": hidden },
          { content: "<p>B. Five others.</p>", placement: "after", "course-id": 999_999 },
          { content: "", placement: "right", "course-id": c },
        ],
      }),
    ]);
    expect(offerings(detail)[0]?.sections[0]?.text).toBe(
      "The minor requires six courses.\nA. Either\n- CHI 120 - Chinese Culture\nOR\n- CHI 122 - Visual Culture *\n- HIS 183 - East Asia\nB. Five others.",
    );
  });
});

describe("pagePrefix", () => {
  it("learns the page's prefix from its course lists (three courses or more)", () => {
    const withList = [
      core("Courses", "", {
        courses: courses(
          "ECO 101 - Principles",
          "ECO 202 - Micro",
          "MAT 110 - Calculus",
          "ECO 203 - Macro",
        ),
      }),
    ];
    expect(pagePrefix(withList)).toBe("ECO");
    expect(
      pagePrefix([core("Courses", "", { courses: courses("ECO 101 - Principles") })]),
    ).toBeNull();
  });
});

describe("requirementsTextOf", () => {
  it("joins sections with a blank line; a heading-only section is its heading", () => {
    expect(
      requirementsTextOf([
        { heading: "Requirements", text: "" },
        { heading: "(1) Six courses", text: "- CHI 120" },
        { heading: "", text: "Loose text" },
      ]),
    ).toBe("Requirements\n\n(1) Six courses\n- CHI 120\n\nLoose text");
  });
});
