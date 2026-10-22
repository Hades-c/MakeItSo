import type { Session } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import {
  aiRequest,
  bodyOf,
  CS_MAJOR,
  ECO_MINOR,
  errorOf,
  insertStudent,
  SECRET_BIO,
  sessionFor,
  stubAuthEnv,
} from "./helpers";
import * as route from "@/app/api/ai/cold-email/route";
import { ColdEmailResultSchema } from "@/lib/api/ai";
import { STUDENT_NAME_PLACEHOLDER } from "@/lib/types/ai";
import { readDataBlocks } from "@/server/ai/blocks";
import { cleanColdEmail } from "@/server/ai/features/cold-email";
import { mockAiRequests, resetMockAi, setMockAiScenario } from "@/server/ai/mock";
import { SYSTEM } from "@/server/ai/prompts/cold-email";
import { getAlumnus } from "@/server/content/alumni";
import { getDb } from "@/server/db";
import { isDefinedRoute } from "@/server/http";

/** POST /api/ai/cold-email (PLAN §6.1 W6 feature 4): contactable verified alumni, {{studentName}} placeholder. */

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => {
  stubAuthEnv();
  vi.stubEnv("AI_PROVIDER", "mock");
});

afterEach(async () => {
  auth.session = null;
  resetMockAi();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function signIn(options: Parameters<typeof insertStudent>[0] = {}) {
  const user = await insertStudent(options);
  auth.session = await sessionFor(user);
  return user;
}

const post = (body: unknown) => route.POST(aiRequest("/api/ai/cold-email", body));

describe("POST /api/ai/cold-email", () => {
  it("is a defineRoute handler with maxDuration 120; 401 signed out; 400 bad input", async () => {
    expect(isDefinedRoute(route.POST)).toBe(true);
    expect(route.maxDuration).toBe(120);
    expect((await post({ alumnusId: "neil-patel" })).status).toBe(401);
    await signIn();
    for (const body of [
      {},
      { alumnusId: "Neil Patel" },
      { alumnusId: "neil-patel", studentName: "Sam" },
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("offers cold e-mail only for contactable alumni (404 for notable or unknown people)", async () => {
    await signIn();
    for (const alumnusId of ["stephen-curry", "nobody-here"]) {
      const res = await post({ alumnusId });
      expect(res.status).toBe(404);
      expect((await errorOf(res)).code).toBe("not_found");
    }
    expect((await post({ alumnusId: "neil-patel", careerSlug: "astronaut" })).status).toBe(404);
    expect(mockAiRequests()).toHaveLength(0);
  });

  it("is disabled while the alumni section is off", async () => {
    await signIn();
    vi.stubEnv("FEATURE_ALUMNI", "false");
    const res = await post({ alumnusId: "neil-patel" });
    expect(res.status).toBe(404);
    expect((await bodyOf(res)).kind).toBe("disabled");
  });

  it("drafts the e-mail with the {{studentName}} placeholder from displayed fields and the allow-listed profile", async () => {
    const user = await signIn();
    const res = await post({ alumnusId: "neil-patel", careerSlug: "software-engineering" });
    expect(res.status).toBe(200);
    const body = ColdEmailResultSchema.parse(await bodyOf(res));
    if (body.kind !== "ok") throw new Error("expected ok");
    expect(body.data.email.body).toContain(STUDENT_NAME_PLACEHOLDER);
    expect(body.data.email.body).not.toContain(user.name);
    expect(body.data.email.subject).toMatch(/Software Engineering/);

    const params = mockAiRequests()[0]!.params;
    expect(params.system).toEqual([
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ]);
    expect(params.output_config?.effort).toBe("low");
    const blocks = readDataBlocks(
      (params.messages[0]!.content as { text: string }[]).map((b) => b.text),
    ) as Record<string, Record<string, unknown>>;
    const neil = getAlumnus("neil-patel")!;
    expect(blocks.catalog_data).toEqual({
      alumnus: {
        name: neil.name,
        classYear: neil.classYear,
        ...(neil.majors ? { majors: neil.majors } : {}),
        role: neil.role,
        organization: neil.organization,
        roleAsOf: neil.roleAsOf,
      },
      career: { name: "Software Engineering", summary: expect.any(String) },
    });
    expect(blocks.student_profile).toEqual({
      majors: [CS_MAJOR],
      minors: [ECO_MINOR],
      graduationYear: 2029,
      standing: "sophomore",
      interests: ["software-engineering"],
    });
    expect(blocks.student_goals).toEqual({ career: "Software Engineering" });
    const whole = JSON.stringify(params);
    for (const secret of [user.id, user.email, user.name, "Studentname", SECRET_BIO, "linkedin"]) {
      expect(whole, secret).not.toContain(secret);
    }
  });

  it("caches per alumnus and career; regenerate makes a new draft", async () => {
    await signIn();
    await post({ alumnusId: "neil-patel" });
    const cached = ColdEmailResultSchema.parse(
      await bodyOf(await post({ alumnusId: "neil-patel" })),
    );
    expect(cached).toMatchObject({ kind: "ok", cached: true });
    expect(mockAiRequests()).toHaveLength(1);
    await post({ alumnusId: "neil-patel", careerSlug: "software-engineering" });
    expect(mockAiRequests()).toHaveLength(2);
    const fresh = ColdEmailResultSchema.parse(
      await bodyOf(await post({ alumnusId: "neil-patel", regenerate: true })),
    );
    expect(fresh).toMatchObject({ kind: "ok", cached: false });
    expect(mockAiRequests()).toHaveLength(3);
  });

  it("passes failures through", async () => {
    await signIn();
    setMockAiScenario("timeout", { times: 1 });
    const res = await post({ alumnusId: "neil-patel" });
    expect(res.status).toBe(504);
    expect((await bodyOf(res)).kind).toBe("timeout");
  });
});

describe("cleanColdEmail", () => {
  it("normalises name slots to {{studentName}} and adds a sign-off when it is missing", () => {
    expect(
      cleanColdEmail({
        subject: "Hello [Your Name]",
        body: "Dear Pat,\n\nThanks!\n\nBest,\n[Your Name]",
      }),
    ).toEqual({ subject: "Hello", body: "Dear Pat,\n\nThanks!\n\nBest,\n{{studentName}}" });
    expect(
      cleanColdEmail({ subject: "Hi", body: "Dear Pat, thanks. {{ student_name }}" })!.body,
    ).toBe("Dear Pat, thanks. {{studentName}}");
    expect(cleanColdEmail({ subject: "Hi", body: "Dear Pat, thanks." })!.body).toBe(
      "Dear Pat, thanks.\n\nBest,\n{{studentName}}",
    );
  });

  it("strips links, addresses and invented template slots", () => {
    const email = cleanColdEmail({
      subject: "Hi",
      body: "Dear Pat, see https://x.example or mail me at me@example.org. {{phoneNumber}}\n\n{{studentName}}",
    })!;
    expect(email.body).not.toMatch(/https?:|@|phoneNumber/);
    expect(email.body).toContain("{{studentName}}");
  });

  it("is null when nothing is left", () => {
    expect(cleanColdEmail({ subject: " ", body: "text" })).toBeNull();
  });
});
