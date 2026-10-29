import { describe, expect, it } from "vitest";
import { ExtractedDeadlineSchema, SyllabusSchema } from "@/lib/types/syllabus";

describe("syllabus types (PLAN-UX §3)", () => {
  it("accepts an extracted deadline (title + a date, no time)", () => {
    const deadline = { title: "Midterm exam", dueAt: "2026-10-15" };
    expect(ExtractedDeadlineSchema.parse(deadline)).toEqual(deadline);
    expect(ExtractedDeadlineSchema.safeParse({ ...deadline, title: "" }).success).toBe(false);
    expect(ExtractedDeadlineSchema.safeParse({ ...deadline, dueAt: "10/15/2026" }).success).toBe(
      false,
    );
    expect(
      ExtractedDeadlineSchema.safeParse({ ...deadline, dueAt: "2026-10-15T23:59:00Z" }).success,
    ).toBe(false);
  });

  it("accepts a stored syllabus with its extracted deadlines", () => {
    const syllabus = {
      id: "0123456789abcdef01234567",
      courseCode: "CSC 221",
      termCode: "202601",
      addedAt: "2026-09-30T12:00:00.000Z",
      extractedDeadlines: [{ title: "Midterm exam", dueAt: "2026-10-15" }],
      planDeadlineCount: 1,
    };
    expect(SyllabusSchema.parse(syllabus)).toEqual(syllabus);
    expect(SyllabusSchema.safeParse({ ...syllabus, courseCode: "not a code" }).success).toBe(false);
    expect(SyllabusSchema.safeParse({ ...syllabus, termCode: "not-a-term" }).success).toBe(false);
    expect(SyllabusSchema.safeParse({ ...syllabus, planDeadlineCount: -1 }).success).toBe(false);
  });
});
