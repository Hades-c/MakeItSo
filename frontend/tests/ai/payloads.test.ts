import { describe, expect, it } from "vitest";
import { planItem } from "./helpers";
import type { Course, Section } from "@/lib/types/catalog";
import { DATA_RULES } from "@/server/ai/blocks";
import { buildParams } from "@/server/ai/client";
import {
  alumnusPayload,
  careerPayload,
  courseAboutPayload,
  studentPlanPayload,
  studentProfilePayload,
} from "@/server/ai/payloads";
import * as careerPlan from "@/server/ai/prompts/career-plan";
import * as coldEmail from "@/server/ai/prompts/cold-email";
import * as courseAbout from "@/server/ai/prompts/course-about";
import * as planSuggestions from "@/server/ai/prompts/plan-suggestions";
import * as professorSummary from "@/server/ai/prompts/professor-summary";
import { getAlumnus } from "@/server/content/alumni";
import { getCareer } from "@/server/content/careers";

/**
 * The payload allow-list (server/ai/payloads.ts) and the frozen prompts. The feature tests check the exact
 * request bodies the routes send; these check the builders on hostile inputs.
 */

const OFFICIAL = {
  majors: ["Major in Computer Science (B.S. Degree)"],
  minors: ["Minor in Economics"],
};

const PROFILE = {
  id: "64b0000000000000000000a1",
  name: "Sam Studentname",
  email: "sam@davidson.edu",
  bio: "SECRET-BIO",
  emailVerifiedAt: "2026-09-01T00:00:00.000Z",
  aiConsentAt: "2026-09-01T00:00:00.000Z",
  majors: ["Major in Computer Science (B.S. Degree)", "Underwater Basketweaving"],
  minors: ["Minor in Economics"],
  graduationYear: 2029,
  standing: { standing: "sophomore" as const, estimated: true },
  interests: ["software-engineering", "not-a-career", "software-engineering"],
};

describe("student profile", () => {
  it("sends only official program names, graduation year, standing and career slugs", () => {
    const payload = studentProfilePayload(PROFILE, OFFICIAL);
    expect(payload).toEqual({
      majors: ["Major in Computer Science (B.S. Degree)"],
      minors: ["Minor in Economics"],
      graduationYear: 2029,
      standing: "sophomore",
      interests: ["software-engineering"],
    });
    const text = JSON.stringify(payload);
    for (const secret of [PROFILE.id, PROFILE.name, PROFILE.email, "SECRET-BIO", "2026-09-01"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("student plan", () => {
  it("sends { termCode, courseCode, status } of active items only (nothing that implies a grade)", () => {
    const items = [
      planItem({
        termCode: "202501",
        courseCode: "CSC 121",
        status: "completed",
        note: "SECRET NOTE",
      }),
      planItem({ termCode: "202601", courseCode: "MAT 150", status: "in-progress" }),
      planItem({ termCode: "202502", courseCode: "CHE 115", status: "failed" }),
      planItem({ termCode: "202502", courseCode: "PHY 120", status: "dropped" }),
      planItem({ termCode: "202502", courseCode: "HIS 101", status: "withdrawn" }),
      planItem({ termCode: "202602", courseCode: "CSC 221", status: "planned", passFail: true }),
      planItem({ termCode: null, courseCode: "BIO 111", status: "completed", source: "ap" }),
    ];
    expect(studentPlanPayload(items)).toEqual([
      { termCode: "202501", courseCode: "CSC 121", status: "completed" },
      { termCode: "202601", courseCode: "MAT 150", status: "in-progress" },
      { termCode: "202602", courseCode: "CSC 221", status: "planned" },
      { termCode: null, courseCode: "BIO 111", status: "completed" },
    ]);
  });
});

describe("course about", () => {
  const section = (letter: string, description: string, prerequisites: string | null): Section => ({
    crn: `1000${letter.charCodeAt(0) % 10}`,
    termCode: "202602",
    courseCode: "HIS 357",
    subject: "HIS",
    number: "357",
    section: letter,
    title: "Topics",
    credits: 1,
    instructors: [{ first: "Jane", last: "Professorname", isStaff: false }],
    meetings: [],
    enrollment: { current: 10, max: 20, remaining: 10 },
    reqCodes: ["HTRQ"],
    prerequisitesText: prerequisites,
    descriptionText: description,
    notes: ["SECRET SECTION NOTE"],
    restrictions: {
      eligibleYears: null,
      untilFirstDay: false,
      permissionRequired: false,
      notIfCompMet: false,
    },
    crossListings: [],
    crossPostings: [],
    regFor: null,
    registrationSections: [],
  });

  it("sends the official text only: title, distinct descriptions, prerequisites and requirement names", () => {
    const course: Course = {
      termCode: "202602",
      code: "HIS 357",
      title: "Topics in History",
      topics: false,
      sections: [
        section("B", "Second topic.", null),
        section("A", "First topic.", "HIS 101"),
        section("C", "First topic.", "HIS 101"),
      ],
      credits: [1],
      reqCodes: ["HTRQ", "NONE"],
    };
    const payload = courseAboutPayload(course);
    expect(payload).toEqual({
      title: "Topics in History",
      descriptions: ["First topic.", "Second topic."],
      prerequisites: ["HIS 101"],
      requirements: [{ code: "HTRQ", name: expect.stringMatching(/Historical/) }],
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("Professorname");
    expect(text).not.toContain("SECRET");
  });
});

describe("alumni and careers", () => {
  it("sends a contactable alumnus's displayed fields only, and nothing for a non-contactable one", () => {
    const neil = getAlumnus("neil-patel")!;
    expect(alumnusPayload(neil)).toEqual({
      name: neil.name,
      classYear: neil.classYear,
      ...(neil.majors ? { majors: neil.majors } : {}),
      role: neil.role,
      organization: neil.organization,
      roleAsOf: neil.roleAsOf,
    });
    expect(JSON.stringify(alumnusPayload(neil))).not.toMatch(/linkedin|sources|https?:/i);
    expect(alumnusPayload(getAlumnus("stephen-curry")!)).toBeNull();
  });

  it("sends a career's curated facts without pay figures or links", () => {
    const payload = careerPayload(getCareer("software-engineering")!);
    expect(payload.slug).toBe("software-engineering");
    expect(JSON.stringify(payload)).not.toMatch(/https?:|medianAnnual|handshake/i);
  });
});

describe("prompts", () => {
  const prompts = [courseAbout, planSuggestions, careerPlan, coldEmail, professorSummary];

  it.each(prompts.map((p) => [p.PROMPT_VERSION, p] as const))(
    "%s: a versioned, frozen system prompt with the data rules and no dates or ids",
    (version, prompt) => {
      expect(version).toMatch(/^[a-z-]+\/\d+$/);
      expect(prompt.SYSTEM).toContain(DATA_RULES);
      expect(prompt.SYSTEM).not.toMatch(/\b(?:19|20)\d{2}\b/);
      expect(prompt.SYSTEM).not.toMatch(/\b[a-f0-9]{24}\b/);
      expect(prompt.SYSTEM).not.toMatch(/\breason(?:ing)?\b/i);
      expect(prompt.TASK).not.toMatch(/\d/);
    },
  );

  it("sends volatile data only in the user turn", () => {
    const request = courseAbout.courseAboutRequest({
      title: "T",
      descriptions: ["Today is special."],
      prerequisites: [],
      requirements: [],
    });
    const params = buildParams(courseAbout.OutputSchema, request);
    expect(JSON.stringify(params.system)).not.toContain("Today is special.");
    expect(JSON.stringify(params.messages)).toContain("Today is special.");
    expect(params.output_config?.effort).toBe("low");
  });

  it("uses high effort for plans and low effort for the short texts (PLAN §6.1 W6)", () => {
    const effort = (r: { effort: string }) => r.effort;
    expect(
      effort(
        courseAbout.courseAboutRequest({
          title: "",
          descriptions: [],
          prerequisites: [],
          requirements: [],
        }),
      ),
    ).toBe("low");
    expect(
      effort(
        planSuggestions.planSuggestionsRequest({
          catalog: {
            today: "",
            currentTerm: "",
            registrationTerm: "",
            targetTerm: { code: "", label: "", scheduled: true },
            candidates: [],
          },
          profile: {
            majors: [],
            minors: [],
            graduationYear: 2029,
            standing: "sophomore",
            interests: [],
          },
          plan: { items: [], openRequirements: [] },
        }),
      ),
    ).toBe("high");
    expect(effort(professorSummary.professorSummaryRequest({ reviews: [] }))).toBe("low");
  });
});
