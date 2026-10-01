import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withCatalogDb } from "../catalog/db";
import {
  aiRequest,
  bodyOf,
  CS_MAJOR,
  draftStore,
  errorOf,
  insertStudent,
  planItem,
  planView,
  SECRET_BIO,
  sessionFor,
  stubAuthEnv,
} from "./helpers";
import * as route from "@/app/api/ai/career-plan/route";
import { CareerPlanResultSchema } from "@/lib/api/ai";
import type { PlanView } from "@/lib/types/plan";
import { readDataBlocks } from "@/server/ai/blocks";
import { groundCareerPlan, officialOnly } from "@/server/ai/features/career-plan";
import { mockAiRequests, resetMockAi, setMockAiScenario } from "@/server/ai/mock";
import { isDefinedRoute } from "@/server/http";
import { getPlan, listDrafts, saveDraft } from "@/server/plan";
import { programNames } from "@/server/programs";

/** POST /api/ai/career-plan (PLAN §6.1 W6 feature 3): careers content + catalog candidates + Acalog names. */

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));
vi.mock("@/server/plan", () => ({
  getPlan: vi.fn(),
  getProgress: vi.fn(),
  saveDraft: vi.fn(),
  listDrafts: vi.fn(),
}));

withCatalogDb();

const store = draftStore();
let view: PlanView = planView([]);

beforeEach(() => {
  stubAuthEnv();
  vi.stubEnv("AI_PROVIDER", "mock");
  store.clear();
  view = planView([planItem({ termCode: "202501", courseCode: "CSC 121", status: "completed" })]);
  vi.mocked(getPlan).mockImplementation(async () => view);
  vi.mocked(saveDraft).mockImplementation(store.saveDraft);
  vi.mocked(listDrafts).mockImplementation(store.listDrafts);
});

afterEach(() => {
  auth.session = null;
  resetMockAi();
});

async function signIn(options: Parameters<typeof insertStudent>[0] = {}) {
  const user = await insertStudent(options);
  auth.session = await sessionFor(user);
  return user;
}

const post = (body: unknown) => route.POST(aiRequest("/api/ai/career-plan", body));

describe("POST /api/ai/career-plan", () => {
  it("is a defineRoute handler with maxDuration 120; 401 signed out; 400 bad slug; 404 unknown career", async () => {
    expect(isDefinedRoute(route.POST)).toBe(true);
    expect(route.maxDuration).toBe(120);
    expect((await post({ careerSlug: "software-engineering" })).status).toBe(401);
    await signIn();
    expect((await post({ careerSlug: "Not A Slug" })).status).toBe(400);
    const unknown = await post({ careerSlug: "astronaut" });
    expect(unknown.status).toBe(404);
    expect((await errorOf(unknown)).code).toBe("not_found");
  });

  it("is disabled while the careers section is off", async () => {
    await signIn();
    vi.stubEnv("FEATURE_CAREERS", "false");
    const res = await post({ careerSlug: "software-engineering" });
    expect(res.status).toBe(404);
    expect((await bodyOf(res)).kind).toBe("disabled");
  });

  it("drafts a grounded plan with official program names and stores its courses as a PlanDraft", async () => {
    const user = await signIn();
    const res = await post({ careerSlug: "software-engineering" });
    expect(res.status).toBe(200);
    const body = CareerPlanResultSchema.parse(await bodyOf(res));
    if (body.kind !== "ok") throw new Error("expected ok");
    const { plan, draft } = body.data;
    const names = await programNames();
    expect(plan.majors.length).toBeGreaterThan(0);
    for (const major of plan.majors) expect(names.majors).toContain(major);
    expect(plan.courses.length).toBeGreaterThan(0);
    expect(plan.courses.some((c) => c.courseCode === "CSC 121")).toBe(false);
    expect(draft).toMatchObject({ kind: "career-plan", promptVersion: "career-plan/1" });
    expect(draft!.items.map((i) => i.courseCode)).toEqual(plan.courses.map((c) => c.courseCode));
    expect(JSON.stringify(plan)).not.toMatch(/https?:|@/);

    const params = mockAiRequests()[0]!.params;
    const blocks = readDataBlocks(
      (params.messages[0]!.content as { text: string }[]).map((b) => b.text),
    ) as Record<string, Record<string, unknown>>;
    expect(Object.keys(blocks).sort()).toEqual([
      "catalog_data",
      "student_goals",
      "student_plan",
      "student_profile",
    ]);
    expect(blocks.student_goals).toEqual({
      career: "software-engineering",
      careerName: "Software Engineering",
    });
    expect(blocks.student_profile).toMatchObject({
      majors: [CS_MAJOR],
      interests: ["software-engineering"],
    });
    const catalog = blocks.catalog_data as {
      programs: { majors: string[] };
      candidates: { courseCode: string }[];
    };
    expect(catalog.programs.majors).toEqual(names.majors);
    expect(catalog.candidates.map((c) => c.courseCode)).not.toContain("CSC 121");
    const whole = JSON.stringify(params);
    for (const secret of [user.id, user.email, user.name, SECRET_BIO])
      expect(whole).not.toContain(secret);

    const again = CareerPlanResultSchema.parse(
      await bodyOf(await post({ careerSlug: "software-engineering" })),
    );
    expect(again).toMatchObject({ kind: "ok", cached: true });
    expect(mockAiRequests()).toHaveLength(1);
  });

  it("drops invented programs and courses: more than 30% of the courses → invalid after one retry", async () => {
    await signIn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setMockAiScenario("ungrounded");
    const res = await post({ careerSlug: "software-engineering" });
    expect(res.status).toBe(502);
    expect((await bodyOf(res)).kind).toBe("invalid");
    expect(mockAiRequests()).toHaveLength(2);
    expect(saveDraft).not.toHaveBeenCalled();
  });
});

describe("career-plan grounding", () => {
  const candidate = {
    courseCode: "CSC 221",
    canonical: "CSC 221",
    siblings: [],
    terms: new Map([["202602", "scheduled" as const]]),
    termList: [{ code: "202602", basis: "scheduled" as const }],
    title: "Data Structures",
    source: "curated" as const,
    curatedWhy: "Core programming course.",
  };
  const context = {
    candidates: [candidate],
    taken: new Set<string>(),
    official: { majors: [CS_MAJOR], minors: ["Minor in Economics"] },
    careerName: "Software Engineering",
  };

  it("keeps official names only and cleans every text", () => {
    expect(officialOnly([CS_MAJOR, "Major in Magic", ` ${CS_MAJOR} `], [CS_MAJOR], 2)).toEqual([
      CS_MAJOR,
    ]);
    const grounded = groundCareerPlan(
      {
        overview: "Build toward software. See https://jobs.example.",
        majors: [CS_MAJOR, "Major in Magic"],
        minors: ["Minor in Economics", "Minor in Nothing"],
        courses: [{ courseCode: "CSC 221", termCode: "202602", why: "" }],
        experiences: [
          {
            title: "Research with faculty",
            when: "Summer after sophomore year",
            why: "Learn by doing.",
          },
          { title: "", when: "x", why: "y" },
        ],
      },
      context,
    );
    expect(grounded.invalid).toBe(false);
    expect(grounded.plan).toEqual({
      overview: "Build toward software. See.",
      majors: [CS_MAJOR],
      minors: ["Minor in Economics"],
      courses: [{ courseCode: "CSC 221", termCode: "202602", reason: "Core programming course." }],
      experiences: [
        {
          title: "Research with faculty",
          when: "Summer after sophomore year",
          why: "Learn by doing.",
        },
      ],
    });
  });

  it("is invalid without an overview", () => {
    expect(
      groundCareerPlan(
        {
          overview: " ",
          majors: [],
          minors: [],
          courses: [{ courseCode: "CSC 221", termCode: "202602", why: "x" }],
          experiences: [],
        },
        context,
      ).invalid,
    ).toBe(true);
  });
});
