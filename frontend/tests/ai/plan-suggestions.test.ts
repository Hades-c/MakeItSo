import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withCatalogDb } from "../catalog/db";
import {
  aiRequest,
  bodyOf,
  CS_MAJOR,
  draftStore,
  ECO_MINOR,
  errorOf,
  insertStudent,
  planItem,
  planView,
  progressWith,
  SECRET_BIO,
  sessionFor,
  stubAuthEnv,
} from "./helpers";
import * as route from "@/app/api/ai/plan-suggestions/route";
import { PlanSuggestionsResultSchema } from "@/lib/api/ai";
import type { PlanProgress, PlanView } from "@/lib/types/plan";
import AiCache from "@/models/AiCache";
import { readDataBlocks } from "@/server/ai/blocks";
import { GROUNDING_FAILED_MESSAGE, GROUNDING_RETRY_NOTE } from "@/server/ai/features/common";
import { NO_CANDIDATES_MESSAGE } from "@/server/ai/features/plan-suggestions";
import { mockAiRequests, resetMockAi, setMockAiScenario } from "@/server/ai/mock";
import { SYSTEM } from "@/server/ai/prompts/plan-suggestions";
import { REGENERATION_QUOTA_MESSAGE } from "@/server/ai/usage";
import { isDefinedRoute } from "@/server/http";
import { getPlan, getProgress, listDrafts, saveDraft } from "@/server/plan";

/**
 * POST /api/ai/plan-suggestions (PLAN §6.1 W6 feature 2) through the mock provider and the real fixture catalog.
 * server/plan is W5s's (built in parallel): its frozen exports are mocked here.
 */

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
const state = { view: planView([]), progress: progressWith(["SSRQ", "VPRQ", "CULT"]) };

beforeEach(() => {
  stubAuthEnv();
  vi.stubEnv("AI_PROVIDER", "mock");
  store.clear();
  state.view = planView([
    planItem({ termCode: "202501", courseCode: "CSC 121", status: "completed" }),
    planItem({ termCode: "202502", courseCode: "CHE 115", status: "failed" }),
    planItem({ termCode: "202601", courseCode: "ECO 101", status: "in-progress" }),
    planItem({ termCode: "202602", courseCode: "SOC 101", status: "planned" }),
  ]);
  state.progress = progressWith(["SSRQ", "VPRQ", "CULT"]);
  vi.mocked(getPlan).mockImplementation(async (): Promise<PlanView> => state.view);
  vi.mocked(getProgress).mockImplementation(async (): Promise<PlanProgress> => state.progress);
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

const post = (body: unknown) => route.POST(aiRequest("/api/ai/plan-suggestions", body));

async function okDraft(res: Response) {
  expect(res.status).toBe(200);
  const body = PlanSuggestionsResultSchema.parse(await bodyOf(res));
  if (body.kind !== "ok") throw new Error(`expected ok, got ${body.kind}`);
  return body;
}

describe("route contract", () => {
  it("is a defineRoute handler with maxDuration 120; 401 signed out; 400 for bad input", async () => {
    expect(isDefinedRoute(route.POST)).toBe(true);
    expect(route.maxDuration).toBe(120);
    expect((await post({})).status).toBe(401);
    await signIn();
    for (const body of [{ termCode: "2026" }, { regenerate: "yes" }, { userId: "x" }]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    const past = await post({ termCode: "202601" });
    expect(past.status).toBe(400);
    expect((await errorOf(past)).message).toMatch(/Spring 2027 or later/);
    expect((await post({ termCode: "203601" })).status).toBe(400);
    const summer = await post({ termCode: "202603" });
    expect(summer.status).toBe(400);
    expect((await errorOf(summer)).message).toMatch(/fall and spring/);
  });

  it("gates before reading the plan", async () => {
    await signIn({ consent: false });
    const res = await post({});
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).kind).toBe("consent_required");
    expect(getPlan).not.toHaveBeenCalled();
  });
});

describe("retrieve-then-rank", () => {
  it("suggests grounded candidates for the registration term and stores them as a PlanDraft", async () => {
    await signIn();
    const body = await okDraft(await post({}));
    expect(body).toMatchObject({
      servedModel: "claude-sonnet-5-5",
      fallbackUsed: false,
      cached: false,
    });
    const { draft } = body.data;
    expect(draft).toMatchObject({
      kind: "plan-suggestions",
      promptVersion: "plan-suggestions/1",
      status: "pending",
    });
    expect(draft.items.length).toBeGreaterThan(0);
    expect(draft.items.length).toBeLessThanOrEqual(5);
    for (const item of draft.items) {
      expect(item).toMatchObject({
        termCode: "202602",
        basis: "scheduled",
        reason: expect.any(String),
      });
      expect(["CSC 121", "ECO 101", "SOC 101"]).not.toContain(item.courseCode);
    }
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(store.of(auth.session!.user.id)).toHaveLength(1);

    // Every suggestion was a candidate the server sent.
    const blocks = readDataBlocks(
      (mockAiRequests()[0]!.params.messages[0]!.content as { type: string; text: string }[]).map(
        (b) => b.text,
      ),
    ) as { catalog_data: { candidates: { courseCode: string }[] } };
    const sentCodes = blocks.catalog_data.candidates.map((c) => c.courseCode);
    for (const item of draft.items) expect(sentCodes).toContain(item.courseCode);
    expect(sentCodes).not.toContain("SOC 101");
    expect(sentCodes).not.toContain("ECO 101");
  });

  it("sends exactly the allow-listed profile and plan, and the frozen system prompt", async () => {
    const user = await signIn();
    await okDraft(await post({}));
    const params = mockAiRequests()[0]!.params;
    expect(params.system).toEqual([
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ]);
    expect(params.output_config?.effort).toBe("high");
    const texts = (params.messages[0]!.content as { type: string; text: string }[]).map(
      (b) => b.text,
    );
    const blocks = readDataBlocks(texts) as Record<string, Record<string, unknown>>;
    expect(blocks.student_profile).toEqual({
      majors: [CS_MAJOR],
      minors: [ECO_MINOR],
      graduationYear: 2029,
      standing: "sophomore",
      interests: ["software-engineering"],
    });
    expect(blocks.student_plan).toEqual({
      items: [
        { termCode: "202501", courseCode: "CSC 121", status: "completed" },
        { termCode: "202601", courseCode: "ECO 101", status: "in-progress" },
        { termCode: "202602", courseCode: "SOC 101", status: "planned" },
      ],
      openRequirements: [
        { code: "SSRQ", name: expect.any(String) },
        { code: "VPRQ", name: expect.any(String) },
        { code: "CULT", name: expect.any(String) },
      ],
    });
    expect(blocks.catalog_data).toMatchObject({
      today: "2026-09-30",
      currentTerm: "202601",
      registrationTerm: "202602",
      targetTerm: { code: "202602", label: "Spring 2027", scheduled: true },
    });
    const whole = JSON.stringify(params);
    for (const secret of [
      user.id,
      user.email,
      user.name,
      SECRET_BIO,
      "failed",
      "CHE 115",
      "not-a-career",
      "Not An Official Major",
    ]) {
      expect(whole, secret).not.toContain(secret);
    }
  });

  it("labels suggestions for an unpublished term as based on past offerings", async () => {
    await signIn();
    const { draft } = (await okDraft(await post({ termCode: "202701" }))).data;
    expect(draft.items.length).toBeGreaterThan(0);
    for (const item of draft.items)
      expect(item).toMatchObject({ termCode: "202701", basis: "past-offerings" });
  });

  it("does not call the model when no course fills an open requirement", async () => {
    await signIn();
    state.progress = progressWith([]);
    const res = await post({});
    expect(res.status).toBe(502);
    expect(await bodyOf(res)).toEqual({ kind: "invalid", message: NO_CANDIDATES_MESSAGE });
    expect(mockAiRequests()).toHaveLength(0);
  });
});

describe("grounding failures", () => {
  it("retries once when more than 30% of the suggestions are dropped, then answers invalid and caches nothing", async () => {
    await signIn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setMockAiScenario("ungrounded");
    const res = await post({});
    expect(res.status).toBe(502);
    expect(await bodyOf(res)).toEqual({ kind: "invalid", message: GROUNDING_FAILED_MESSAGE });
    expect(mockAiRequests()).toHaveLength(2);
    // The retry adds one user-turn note; the system prompt stays byte-identical.
    const [first, retry] = mockAiRequests().map((r) => r.params);
    expect(retry!.system).toEqual(first!.system);
    const texts = (retry!.messages[0]!.content as { text: string }[]).map((b) => b.text);
    expect(texts.at(-1)).toBe(GROUNDING_RETRY_NOTE);
    expect(texts.slice(0, -1)).toEqual(
      (first!.messages[0]!.content as { text: string }[]).map((b) => b.text),
    );
    expect(saveDraft).not.toHaveBeenCalled();
    expect(await AiCache.countDocuments()).toBe(0);
    expect(warn.mock.calls.flat().join(" ")).toContain("plan-suggestions/1");
  });

  it("recovers on the retry", async () => {
    await signIn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setMockAiScenario("ungrounded", { times: 1 });
    await okDraft(await post({}));
    expect(mockAiRequests()).toHaveLength(2);
  });

  it("keeps an answer with at most 30% dropped, without the invented course", async () => {
    await signIn();
    setMockAiScenario("one_ungrounded", { times: 1 });
    const { draft } = (await okDraft(await post({}))).data;
    expect(draft.items).toHaveLength(4);
    expect(draft.items.some((i) => i.courseCode.startsWith("FAK"))).toBe(false);
    expect(mockAiRequests()).toHaveLength(1);
  });

  it("passes model failures through without saving anything", async () => {
    await signIn();
    setMockAiScenario("refusal", { times: 1 });
    const res = await post({});
    expect(res.status).toBe(422);
    expect(saveDraft).not.toHaveBeenCalled();
  });
});

describe("personal cache and regenerations", () => {
  it("serves the stored draft (with its current status) until the plan changes", async () => {
    await signIn();
    const first = (await okDraft(await post({}))).data.draft;
    const userId = auth.session!.user.id;
    store.of(userId)[0]!.status = "dismissed";
    const second = await okDraft(await post({}));
    expect(second.cached).toBe(true);
    expect(second.data.draft).toMatchObject({ id: first.id, status: "dismissed" });
    expect(mockAiRequests()).toHaveLength(1);

    state.view = planView([
      ...state.view.items,
      planItem({ termCode: "202602", courseCode: "ART 101", status: "planned" }),
    ]);
    const third = await okDraft(await post({}));
    expect(third.cached).toBe(false);
    expect(mockAiRequests()).toHaveLength(2);
  });

  it("regenerates when the stored draft is gone", async () => {
    await signIn();
    await okDraft(await post({}));
    store.clear();
    expect((await okDraft(await post({}))).cached).toBe(false);
  });

  it("allows 3 regenerations a day; a regenerate without an answer yet is a plain generation", async () => {
    await signIn();
    await okDraft(await post({ regenerate: true })); // nothing cached yet: not a regeneration
    for (let i = 0; i < 3; i++)
      expect((await okDraft(await post({ regenerate: true }))).cached).toBe(false);
    const res = await post({ regenerate: true });
    expect(res.status).toBe(429);
    expect(await bodyOf(res)).toEqual({ kind: "quota", message: REGENERATION_QUOTA_MESSAGE });
    // The saved answer is still served.
    expect((await okDraft(await post({}))).cached).toBe(true);
  });

  it("keeps one student's suggestions from another", async () => {
    const a = await signIn();
    await okDraft(await post({}));
    await signIn({ email: "other-student@davidson.edu" });
    const b = await okDraft(await post({}));
    expect(b.cached).toBe(false);
    expect(store.of(a.id)).toHaveLength(1);
    expect(await AiCache.countDocuments({ feature: "plan-suggestions", scope: "user" })).toBe(2);
  });
});
