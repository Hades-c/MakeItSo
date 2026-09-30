import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertStudent } from "./helpers";
import { aiGateFailure, AI_FEATURES, type AiFeature } from "@/lib/types/ai";
import { aiGateInput } from "@/server/ai/gate";
import { aiConfigured } from "@/server/ai/provider";
import { getDb } from "@/server/db";

/**
 * The AI gate (lib/types/ai.ts aiGateFailure order): disabled → not_configured → unverified → consent_required,
 * with W3's account fields (emailVerifiedAt on an @davidson.edu address, aiConsentAt, adultAttestedAt).
 */

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function gate(userId: string, feature: AiFeature = "course-about") {
  return aiGateFailure(await aiGateInput(userId, feature))?.kind ?? null;
}

describe("configuration", () => {
  it("is configured with the mock provider, or with anthropic and an API key", () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(aiConfigured()).toBe(true);
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(aiConfigured()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-x");
    expect(aiConfigured()).toBe(true);
  });

  it("treats the mock provider on Vercel production as not configured (and logs why)", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(aiConfigured()).toBe(false);
    expect(errors.mock.calls.flat().join(" ")).toMatch(/AI_PROVIDER must not be "mock"/);
  });
});

describe("gate order", () => {
  it("lets a verified, consenting @davidson.edu student through", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const user = await insertStudent();
    expect(await aiGateInput(user.id, "course-about")).toEqual({
      enabled: true,
      configured: true,
      verified: true,
      consented: true,
    });
    expect(await gate(user.id)).toBeNull();
  });

  it("disabled first: AI_ENABLED off wins over everything", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    const user = await insertStudent({ verified: false, consent: false });
    for (const feature of AI_FEATURES) expect(await gate(user.id, feature)).toBe("disabled");
  });

  it("then not_configured", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const user = await insertStudent({ verified: false, consent: false });
    expect(await gate(user.id)).toBe("not_configured");
  });

  it("then unverified: an unverified mailbox, or a verified non-Davidson address", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const unverified = await insertStudent({ verified: false, consent: false });
    expect(await gate(unverified.id)).toBe("unverified");
    const legacy = await insertStudent({ email: "legacy@gmail.com" });
    expect(await gate(legacy.id)).toBe("unverified");
    expect(await gate("64b0000000000000000000ff")).toBe("unverified");
    expect(await gate("not-an-id")).toBe("unverified");
  });

  it("then consent_required: aiConsentAt and the 18+ attestation are both needed", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const noConsent = await insertStudent({ consent: false });
    expect(await gate(noConsent.id)).toBe("consent_required");
    const notAttested = await insertStudent({ adult: false });
    expect(await gate(notAttested.id)).toBe("consent_required");
  });
});

describe("feature sections", () => {
  it("career plans need the careers section; cold e-mail the alumni section (which needs careers)", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const user = await insertStudent();
    vi.stubEnv("FEATURE_CAREERS", "false");
    expect(await gate(user.id, "career-plan")).toBe("disabled");
    expect(await gate(user.id, "cold-email")).toBe("disabled");
    expect(await gate(user.id, "plan-suggestions")).toBeNull();
    vi.stubEnv("FEATURE_CAREERS", "true");
    vi.stubEnv("FEATURE_ALUMNI", "false");
    expect(await gate(user.id, "career-plan")).toBeNull();
    expect(await gate(user.id, "cold-email")).toBe("disabled");
  });

  it("professor summaries are off unless RMP_SUMMARIES_ENABLED (which needs RMP_ENABLED)", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const user = await insertStudent();
    expect(await gate(user.id, "professor-summary")).toBe("disabled");
    vi.stubEnv("RMP_SUMMARIES_ENABLED", "true");
    expect(await gate(user.id, "professor-summary")).toBeNull();
    vi.stubEnv("RMP_ENABLED", "false");
    expect(await gate(user.id, "professor-summary")).toBe("disabled");
  });
});
