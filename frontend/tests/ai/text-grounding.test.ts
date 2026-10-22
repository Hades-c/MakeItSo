import { describe, expect, it } from "vitest";
import {
  anyCourseCode,
  courseCodesIn,
  deadlines,
  programSubject,
  programSubjects,
  properNouns,
  unknownCourses,
  unknownPrograms,
  vocabularyOf,
} from "@/server/ai/text-grounding";

/** Grounding of model free text (PLAN §5): courses, dates, programs and proper nouns the data never gave. */

const CS_MAJOR = "Major in Computer Science (B.S. Degree)";
const ENV_MAJOR = "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)";

describe("course codes", () => {
  it("finds codes however they are written, normalised", () => {
    expect(courseCodesIn("Take CSC221, ECO-101 and MUS 101L together.")).toEqual([
      "CSC 221",
      "ECO 101",
      "MUS 101L",
    ]);
    expect(courseCodesIn("Fills your SSRQ slot in 2026.")).toEqual([]);
  });

  it("drops text naming a course outside the allowed set", () => {
    const filter = unknownCourses(new Set(["CSC 221", "ECO 101"]));
    expect(filter("Pairs well with ECO 101.")).toBe(false);
    expect(filter("Take it together with ECO 999 and FAK 123 next spring.")).toBe(true);
    expect(anyCourseCode("Follows CSC 121.")).toBe(true);
    expect(anyCourseCode("An introduction to data structures.")).toBe(false);
  });
});

describe("deadlines and dates", () => {
  it.each([
    "Apply by November 15 for the program.",
    "The deadline is in the fall.",
    "Applications close early in spring.",
    "Submit before 11/15.",
    "Interviews start on the 3rd of March.",
    "Register no later than Oct. 2.",
  ])("drops %j", (text) => {
    expect(deadlines(text)).toBe(true);
  });

  it("keeps seasons and terms without a date", () => {
    expect(deadlines("Research with faculty in the summer after sophomore year.")).toBe(false);
    expect(deadlines("Take it in Spring 2027.")).toBe(false);
    expect(deadlines("You may want to start early.")).toBe(false);
  });
});

describe("majors and minors", () => {
  const subjects = programSubjects({
    majors: [CS_MAJOR, ENV_MAJOR],
    minors: ["Minor in Economics"],
  });

  it("reduces official names to their subject", () => {
    expect(programSubject(CS_MAJOR)).toBe("computer science");
    expect(programSubject(ENV_MAJOR)).toBe("environmental studies");
  });

  it("keeps official programs of the right kind", () => {
    const filter = unknownPrograms(subjects);
    expect(filter("Declare the Major in Computer Science early.")).toBe(false);
    expect(filter("A Computer Science major opens many doors.")).toBe(false);
    expect(filter("An Economics minor pairs well.")).toBe(false);
    expect(filter("Consider a major in Environmental Studies as well.")).toBe(false);
  });

  it("drops unofficial programs, and programs of the wrong kind", () => {
    const filter = unknownPrograms(subjects);
    expect(filter("Declare the Major in Underwater Basketweaving and take more.")).toBe(true);
    expect(filter("A Data Science major is ideal.")).toBe(true);
    expect(filter("Add a minor in Computer Science.")).toBe(true);
  });
});

describe("proper nouns", () => {
  const vocabulary = vocabularyOf([
    "Software Engineering",
    "Data Structures",
    "Center for Career Development",
  ]);

  it("keeps words the data used and ordinary sentence starts", () => {
    const lenient = properNouns(vocabulary, { strict: false });
    expect(lenient("Visit the Center for Career Development in your first year.")).toBe(false);
    expect(lenient("Data Structures is the core of Software Engineering.")).toBe(false);
    expect(lenient("Start with small projects.")).toBe(false);
    // Course codes are unknownCourses' business: their department prefix is not an unknown acronym.
    expect(lenient("Take CSC 221 and ECO101 early.")).toBe(false);
    expect(properNouns(vocabulary, { strict: true })("Tutor for CSC 121")).toBe(false);
  });

  it("drops unknown organisations, acronyms and (strict) any unknown capitalised word", () => {
    const lenient = properNouns(vocabulary, { strict: false });
    expect(lenient("Many students intern at Goldman Sachs.")).toBe(true);
    expect(lenient("Join the ACM chapter.")).toBe(true);
    const strict = properNouns(vocabulary, { strict: true });
    expect(strict("Google STEP internship")).toBe(true);
    expect(strict("Google internship")).toBe(true);
    expect(strict("Research with faculty")).toBe(false);
  });
});
