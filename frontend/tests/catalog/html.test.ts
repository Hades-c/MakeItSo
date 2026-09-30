import { describe, expect, it } from "vitest";
import { FIXTURE_TERMS, fixtureItems, rawSection } from "./helpers";
import { cleanText, decodeEntities, parseDescription } from "@/server/catalog/html";

describe("entities (PLAN §5: entities decoded, also when upstream double-encodes)", () => {
  it("decodes repeatedly until stable", () => {
    expect(decodeEntities("Literature &amp;amp; Medicine")).toBe("Literature & Medicine");
    expect(decodeEntities("Rock &amp;amp;amp; Roll")).toBe("Rock & Roll");
    expect(decodeEntities("High and&amp;amp;nbsp;Late")).toBe("High and Late");
    expect(decodeEntities("people&apos;s &quot;natural&quot; world")).toBe(
      `people's "natural" world`,
    );
    expect(decodeEntities("no entities")).toBe("no entities");
  });

  it("cleans one-line strings (titles, notes, names)", () => {
    expect(cleanText("  Intro to Africana Studies ")).toBe("Intro to Africana Studies");
    expect(cleanText("Leadrshp&amp;Mgt  in  Arts")).toBe("Leadrshp&Mgt in Arts");
    expect(cleanText(null)).toBe("");
  });
});

describe("parseDescription: HTML → text", () => {
  it("turns paragraphs, breaks and lists into plain text", () => {
    const { descriptionText } = parseDescription(
      "<p>First&nbsp;&nbsp;paragraph<br>\nsecond line</p>\n\n<p> </p><ul>\n<li>One</li>\n<li>Two</li></ul><p>Last <em>word</em>.</p>",
    );
    expect(descriptionText).toBe("First paragraph\nsecond line\n\n• One\n• Two\n\nLast word.");
  });

  it("decodes entity-encoded markup and skips scripts", () => {
    expect(parseDescription("&lt;p&gt;Hello &amp;amp; bye&lt;/p&gt;").descriptionText).toBe(
      "Hello & bye",
    );
    expect(
      parseDescription("<p>Kept</p><script>alert(1)</script><style>p{}</style>").descriptionText,
    ).toBe("Kept");
  });

  it("keeps real http(s) links as text, not tracking wrappers or mailto", () => {
    const html =
      '<p>See <a href="https://collegecatalog.davidson.edu/wri101_descriptions" target="_blank">Course Descriptions</a>.</p>' +
      "<p>Ask <a href=&quot;mailto:contact@example.edu&quot;>the instructor</a> or read " +
      "<a href=&quot;https://nam10.safelinks.protection.outlook.com/?url=x&amp;amp;data=y&quot;>fables</a> and " +
      '<a href="https://www.davidson.edu/">https://www.davidson.edu/</a></p>';
    expect(parseDescription(html).descriptionText).toBe(
      "See Course Descriptions (https://collegecatalog.davidson.edu/wri101_descriptions).\n\n" +
        "Ask the instructor or read fables and https://www.davidson.edu/",
    );
  });

  it("keeps the line breaks of text outside any paragraph", () => {
    expect(parseDescription("Line one \nLine two\n\nNew paragraph").descriptionText).toBe(
      "Line one\nLine two\n\nNew paragraph",
    );
  });
});

describe("parseDescription: the leading instructor paragraph is dropped", () => {
  const cases: [string, string, string][] = [
    [
      "label + names + text in one paragraph",
      "<p><strong>Instructor</strong><br>\nAldridge<br>\n<br>\nAn examination of the movement.</p>",
      "An examination of the movement.",
    ],
    [
      "label and names in their own paragraphs",
      "<p><strong>Instructors</strong></p>\n<p>Sample, Green, Pyle</p>\n<p>A team-taught course.</p>",
      "A team-taught course.",
    ],
    [
      "plain label",
      "<p>Instructor</p> <p>Smith, Melanakos, El Bejjani</p> <p>BIO115 is an introductory course.</p>",
      "BIO115 is an introductory course.",
    ],
    [
      "split bold label",
      "<p><strong>Instructor</strong><strong>s</strong><br> Seide, Staff</p> <p>Introduction to sociology.</p>",
      "Introduction to sociology.",
    ],
    [
      "typo",
      "<p><strong>Insructor</strong><br>\nCannon</p>\n\n<p>This course is designed for students.</p>",
      "This course is designed for students.",
    ],
    [
      "Faculty",
      "<p><strong>Faculty</strong><br>\nHe</p>\n\n<p>Have you ever wondered?</p>",
      "Have you ever wondered?",
    ],
    [
      "label with a colon, names inline",
      "<p><strong>Instructor:</strong> Kumar</p><p>Economic thought.</p>",
      "Economic thought.",
    ],
    [
      "label wrapping the names",
      "<p><strong>Instructor<br> Brown</strong></p> <p>This introductory course.</p>",
      "This introductory course.",
    ],
    [
      "after a term heading",
      "<h1>Fall 2026</h1> <p><strong>Instructor</strong><br> J Smith</p> <p>A survey.</p>",
      "Fall 2026\n\nA survey.",
    ],
    [
      "a description with no markup",
      "Instructor \nStaff\n\nIndependent study under the direction of a faculty member. ",
      "Independent study under the direction of a faculty member.",
    ],
  ];
  it.each(cases)("%s", (_name, html, expected) => {
    expect(parseDescription(html).descriptionText).toBe(expected);
  });

  it("keeps instructor mentions that are not the leading label paragraph", () => {
    const later =
      "<p>One.</p><p>Two.</p><p>Three.</p><p><strong>Instructor</strong><br>Keith</p><p>Topic.</p>";
    expect(parseDescription(later).descriptionText).toBe(
      "One.\n\nTwo.\n\nThree.\n\nInstructor\nKeith\n\nTopic.",
    );
    const sentence =
      "<p>Questions regarding enrolling should be directed to the Senior Military Science Instructor</p>";
    expect(parseDescription(sentence).descriptionText).toBe(
      "Questions regarding enrolling should be directed to the Senior Military Science Instructor",
    );
    const long = `<p><strong>Instructor</strong></p><p>${"A long first sentence of description. ".repeat(6)}</p>`;
    expect(parseDescription(long).descriptionText).toContain("A long first sentence");
  });
});

describe("parseDescription: the official Prerequisites block", () => {
  it("cuts upstream's appended block out of the description", () => {
    const parts = parseDescription(
      "<p>Study of games.</p><br><b>Prerequisites</b><br>Economics 202 and 105. ",
    );
    expect(parts).toEqual({
      descriptionText: "Study of games.",
      prerequisitesText: "Economics 202 and 105.",
    });
  });

  it("is null for an empty block or none at all", () => {
    expect(parseDescription("<p>Text</p><br><b>Prerequisites</b><br>")).toEqual({
      descriptionText: "Text",
      prerequisitesText: null,
    });
    expect(parseDescription("<p>Text</p>").prerequisitesText).toBeNull();
    expect(parseDescription(null)).toEqual({ descriptionText: "", prerequisitesText: null });
  });

  it("accepts <b>/<strong>, Prerequisite(s), with the colon inside or outside the tag", () => {
    for (const marker of [
      "<b>Prerequisites:</b>",
      "<strong>Prerequisites</strong>",
      "<b>Prerequisite</b>:",
      "<strong>Prerequisite(s):</strong>",
      "<b>Prerequisite (s)</b> :",
    ]) {
      expect(parseDescription(`<p>Body.</p><br>${marker}<br>CSC 221`), marker).toEqual({
        descriptionText: "Body.",
        prerequisitesText: "CSC 221",
      });
    }
  });

  it("runs to the end of its paragraph when written inside one", () => {
    expect(
      parseDescription(
        "<p>Intro.</p><p><strong>Prerequisite(s):</strong> ECO 101 or permission.</p><p>More text.</p>",
      ),
    ).toEqual({
      descriptionText: "Intro.\n\nMore text.",
      prerequisitesText: "ECO 101 or permission.",
    });
  });

  it("keeps an upstream block's own paragraphs and line breaks", () => {
    expect(
      parseDescription(
        "<p>X</p><br><b>Prerequisites</b><br>Conducted in Spanish. \n\nPrerequisites &amp; Notes \n\nSpanish 260. ",
      ).prerequisitesText,
    ).toBe("Conducted in Spanish.\n\nPrerequisites & Notes\n\nSpanish 260.");
    expect(
      parseDescription("<p>X</p><br><b>Prerequisites:</b><br><p>Economics 202 and 105.</p>")
        .prerequisitesText,
    ).toBe("Economics 202 and 105.");
  });

  it("uses the last non-empty block and never takes prose mentioning prerequisites", () => {
    expect(
      parseDescription(
        "<p>Prerequisites: Economics 101, 202 (in the prose).</p><br><b>Prerequisites</b><br>",
      ),
    ).toEqual({
      descriptionText: "Prerequisites: Economics 101, 202 (in the prose).",
      prerequisitesText: null,
    });
    expect(
      parseDescription(
        "<p><b>Prerequisites:</b> MAT 110</p><br><b>Prerequisites</b><br>MAT 110 or placement",
      ),
    ).toEqual({
      descriptionText: "Prerequisites: MAT 110",
      prerequisitesText: "MAT 110 or placement",
    });
  });
});

describe("prerequisites of 20 sampled fixture sections (hand-checked against the recorded HTML)", () => {
  const samples: [term: string, section: string, prerequisites: string | null][] = [
    ["202602", "ECO 319 A", "Economics 202 and 105."],
    ["202601", "ECO 396 A", "Economics 202 or 203 or 205 and permission of the instructor."],
    [
      "202601",
      "CSC 383 A",
      "Prerequisites & Notes\nCSC 221 and CSC/MAT 220, or permission of instructor required",
    ],
    [
      "202601",
      "SPA 306 A",
      "Conducted in Spanish.\n\nPrerequisites & Notes\n\nSpanish 260 or its equivalent.",
    ],
    [
      "202602",
      "BIO 267 A",
      "Prerequisite: Successful completion of BIO 111, BIO 113, BIO115, ENV101, or ENV 201 is required. " +
        "Successful completion of CHE 115 and at least one 200+ Biology course is recommended\n" +
        "Students with credit for CHE 372 or who are currently enrolled in CHE372 may not enroll in BIO267",
    ],
    [
      "202601",
      "PHY 330 A",
      "Corequisite: Mathematics 113 or 140. Prerequisite: Physics 220, 225, 230, or 235",
    ],
    ["202601", "PSY 235 A", "PSY101 is a prerequisite."],
    ["202601", "FRE 201 A", "Prerequisites\nFrench 102 or 103-104 at Davidson, or placement exam."],
    [
      "202501",
      "SPA 315 A",
      "Conducted in Spanish\n\nPrerequisites- Spanish 260 and 271 or 272 or their equivalents.",
    ],
    [
      "202402",
      "CSC 374 A",
      "The prerequisites for this course are CSC 221 and (MAT140 or MAT150 or MAT160).",
    ],
    [
      "202202",
      "CSC 362",
      "Prerequisite: CSC 221. Offered fall of odd-numbered years.\n\nDoes not carry Mathematics major credit.",
    ],
    ["202202", "HUM 104", "Prerequisite: HUM 103"],
    ["202601", "MUS 019 A", "Permission of instructor required."],
    [
      "202501",
      "BIO 105 A",
      "No prerequisites. Students cannot have taken any biology course numbered above BIO110.",
    ],
    [
      "202601",
      "CHE 330 A",
      "Chemistry 230. Biology 111 recommended. One laboratory meeting per week. (Fall)",
    ],
    [
      "202602",
      "DAT 153 A",
      "Prerequisite: one of CSC 110, CSC 121, CSC 240, CSC 209, or DIG 120\n\n" +
        "Not open to students with credit for or enrolled in CSC 353",
    ],
    ["202601", "MAT 113 A", "Mathematics 111 or 112 or equivalent preparation."],
    [
      "202602",
      "CSC 221 A",
      "CSC/DIG 120, CSC 121, BIO/CSC 209, PHY 240, or permission of instructor.",
    ],
    [
      "202601",
      "PHY 235 A",
      "Prerequisites: PHY 125 or PHY 130 or permission of the instructor.\n\n" +
        "If you register for this course and do not get a seat, we encourage you to contact the instructor " +
        "to be added to the waitlist.",
    ],
    ["202601", "HIS 357 A", null],
    ["202201", "WRI 101 A", null],
    ["202601", "ECO 101 A", null],
  ];

  it("has 20+ samples", () => {
    expect(samples.length).toBeGreaterThanOrEqual(20);
  });

  it.each(samples)("%s %s", (term, section, prerequisites) => {
    const raw = rawSection(term, section);
    const parts = parseDescription(raw.course_description);
    expect(parts.prerequisitesText).toBe(prerequisites);
    if (prerequisites) expect(parts.descriptionText).not.toContain(prerequisites);
  });
});

describe("every recorded description", () => {
  it("parses to text with no markup, no entities and no leading instructor label", () => {
    let count = 0;
    let withPrerequisites = 0;
    for (const term of FIXTURE_TERMS) {
      for (const item of fixtureItems(term)) {
        const html = (item as { course_description?: string | null }).course_description;
        const { descriptionText, prerequisitesText } = parseDescription(html);
        const text = `${descriptionText}\n${prerequisitesText ?? ""}`;
        expect(text).not.toMatch(/<\/?[a-z][a-z0-9]*[\s>/]/i);
        expect(text).not.toMatch(/&(?:[a-z]+|#\d+);/i);
        // ENG 220 repeats "Instructor / Vaz (Spring 2027)" further down, per term: that one stays.
        expect(descriptionText.split("\n")[0]).not.toMatch(
          /^(?:instructors?|insructors?|faculty)\s*:?(?:\s|$)/i,
        );
        expect(descriptionText).not.toMatch(/^\s|\s$/);
        count += 1;
        if (prerequisitesText) withPrerequisites += 1;
      }
    }
    expect(count).toBe(1669);
    expect(withPrerequisites).toBeGreaterThan(1000);
  });
});
