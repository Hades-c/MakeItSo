import { afterEach, describe, expect, it } from "vitest";
import { generate, type GenerateRequest } from "@/server/ai/client";
import {
  MOCK_AI_SCENARIOS,
  mockAiRequests,
  mockTransport,
  resetMockAi,
  setMockAiScenario,
  type MockAiScenario,
} from "@/server/ai/mock";
import * as careerPlan from "@/server/ai/prompts/career-plan";
import * as coldEmail from "@/server/ai/prompts/cold-email";
import * as courseAbout from "@/server/ai/prompts/course-about";
import * as planSuggestions from "@/server/ai/prompts/plan-suggestions";
import * as professorSummary from "@/server/ai/prompts/professor-summary";

/** The mock provider: deterministic, schema-valid answers from the request, and a knob for every outcome. */

afterEach(() => resetMockAi());

const ABOUT = courseAbout.courseAboutRequest({
  title: "Data Structures",
  descriptions: [
    "Study of lists, trees and graphs. Emphasis on algorithm analysis. Third sentence.",
  ],
  prerequisites: ["CSC 121"],
  requirements: [{ code: "MQRQ", name: "Mathematical and Quantitative Thought" }],
});

const SUGGEST = planSuggestions.planSuggestionsRequest({
  catalog: {
    today: "2026-09-30",
    currentTerm: "202601",
    registrationTerm: "202602",
    targetTerm: { code: "202602", label: "Spring 2027", scheduled: true },
    candidates: ["ECO 101", "SOC 101", "PHI 101"].map((courseCode) => ({
      courseCode,
      title: courseCode,
      basis: "scheduled" as const,
      fills: ["Social-Scientific Thought (SSRQ)"],
      flags: [],
    })),
  },
  profile: { majors: [], minors: [], graduationYear: 2029, standing: "sophomore", interests: [] },
  plan: { items: [], openRequirements: [] },
});

const CAREER = careerPlan.careerPlanRequest({
  catalog: {
    today: "2026-09-30",
    registrationTerm: "202602",
    upcomingTerms: [{ code: "202602", label: "Spring 2027", scheduled: true }],
    career: {
      slug: "software-engineering",
      name: "Software Engineering",
      summary: "",
      whatYouDo: [],
      departments: [],
      relatedPrograms: ["Computer Science"],
      davidsonResources: ["Center for Career Development"],
    },
    programs: {
      majors: ["Major in Computer Science (B.S. Degree)", "Major in Art (A.B. Degree)"],
      minors: [],
    },
    candidates: [
      {
        courseCode: "CSC 221",
        title: "Data Structures",
        terms: [{ code: "202602", basis: "scheduled" }],
      },
    ],
  },
  profile: { majors: [], minors: [], graduationYear: 2029, standing: "sophomore", interests: [] },
  plan: { items: [] },
  goals: { career: "software-engineering", careerName: "Software Engineering" },
});

const EMAIL = coldEmail.coldEmailRequest({
  catalog: { alumnus: { name: "Pat Alum", role: "Engineer" }, career: null },
  profile: {
    majors: ["Major in Art (A.B. Degree)"],
    minors: [],
    graduationYear: 2029,
    standing: "sophomore",
    interests: [],
  },
  goals: { career: null },
});

const SUMMARY = professorSummary.professorSummaryRequest({
  reviews: [{ course: "CSC221", text: "Clear lectures and helpful office hours every week." }],
});

const FEATURES: [string, GenerateRequest, { OutputSchema: Parameters<typeof generate>[0] }][] = [
  ["course-about", ABOUT, courseAbout],
  ["plan-suggestions", SUGGEST, planSuggestions],
  ["career-plan", CAREER, careerPlan],
  ["cold-email", EMAIL, coldEmail],
  ["professor-summary", SUMMARY, professorSummary],
];

describe("answers", () => {
  it.each(FEATURES)("%s: schema-valid and deterministic", async (_feature, request, prompt) => {
    const first = await generate(prompt.OutputSchema, request, { transport: mockTransport });
    const second = await generate(prompt.OutputSchema, request, { transport: mockTransport });
    expect(first.kind).toBe("ok");
    expect(second).toEqual(first);
    expect(first.servedModel).toBe("claude-sonnet-5-5");
    expect(first.usage.inputTokens).toBeGreaterThan(0);
  });

  it("derives the answer from the data blocks", async () => {
    const about = await generate(courseAbout.OutputSchema, ABOUT, { transport: mockTransport });
    expect(about).toMatchObject({
      kind: "ok",
      data: {
        summary: "Study of lists, trees and graphs. Emphasis on algorithm analysis.",
        goodFor: ["want a course that counts toward Mathematical and Quantitative Thought"],
      },
    });
    const picks = await generate(planSuggestions.OutputSchema, SUGGEST, {
      transport: mockTransport,
    });
    expect(picks.kind === "ok" && picks.data.picks.map((p) => p.courseCode)).toEqual([
      "ECO 101",
      "SOC 101",
      "PHI 101",
    ]);
    const email = await generate(coldEmail.OutputSchema, EMAIL, { transport: mockTransport });
    expect(email.kind === "ok" && email.data.body).toContain("{{studentName}}");
  });

  it("records the request bodies it received", async () => {
    await generate(courseAbout.OutputSchema, ABOUT, { transport: mockTransport });
    expect(mockAiRequests()).toHaveLength(1);
    expect(mockAiRequests()[0]).toMatchObject({
      feature: "course-about",
      params: { model: "claude-sonnet-5-5" },
    });
  });
});

describe("the scenario knob", () => {
  const expected: Record<MockAiScenario, string> = {
    ok: "ok",
    refusal: "refused",
    max_tokens: "truncated",
    context_window: "truncated",
    no_text: "invalid",
    bad_json: "invalid",
    wrong_shape: "invalid",
    timeout: "timeout",
    rate_limit: "unavailable",
    connection: "unavailable",
    bad_request: "invalid",
    auth: "not_configured",
    server_error: "unavailable",
    fallback: "ok",
    ungrounded: "ok",
    one_ungrounded: "ok",
    forbidden_claims: "ok",
    links: "ok",
    quote_reviews: "ok",
  };

  it.each(MOCK_AI_SCENARIOS.map((s) => [s, expected[s]] as const))(
    "%s → %s",
    async (scenario, kind) => {
      setMockAiScenario(scenario);
      const outcome = await generate(courseAbout.OutputSchema, ABOUT, { transport: mockTransport });
      expect(outcome.kind).toBe(kind);
    },
  );

  it("marks a fallback-served answer", async () => {
    setMockAiScenario("fallback");
    expect(
      await generate(courseAbout.OutputSchema, ABOUT, { transport: mockTransport }),
    ).toMatchObject({
      kind: "ok",
      servedModel: "claude-sonnet-5",
      fallbackUsed: true,
    });
  });

  it("applies to a number of calls and to one feature only", async () => {
    setMockAiScenario("refusal", { times: 1, feature: "plan-suggestions" });
    expect(
      (await generate(courseAbout.OutputSchema, ABOUT, { transport: mockTransport })).kind,
    ).toBe("ok");
    expect(
      (await generate(planSuggestions.OutputSchema, SUGGEST, { transport: mockTransport })).kind,
    ).toBe("refused");
    expect(
      (await generate(planSuggestions.OutputSchema, SUGGEST, { transport: mockTransport })).kind,
    ).toBe("ok");
  });

  it("invents courses for the grounding scenarios", async () => {
    setMockAiScenario("ungrounded");
    const outcome = await generate(planSuggestions.OutputSchema, SUGGEST, {
      transport: mockTransport,
    });
    expect(
      outcome.kind === "ok" && outcome.data.picks.every((p) => p.courseCode.startsWith("FAK")),
    ).toBe(true);
    setMockAiScenario("one_ungrounded");
    const one = await generate(planSuggestions.OutputSchema, SUGGEST, { transport: mockTransport });
    expect(one.kind === "ok" && one.data.picks.map((p) => p.courseCode)).toEqual([
      "ECO 101",
      "SOC 101",
      "PHI 101",
      "FAK 901",
    ]);
  });
});
