import { describe, expect, it, vi } from "vitest";
import {
  aiProviderConfigured,
  joinWords,
  landingClaims,
  loadLandingClaims,
} from "@/app/(marketing)/_lib/claims";
import type { Flags } from "@/lib/flags";

/** Which sections the landing may describe: flags, plus mail (alumni and AI need verified accounts) and AI setup. */

const ON: Flags = {
  careers: true,
  events: true,
  alumni: true,
  ai: true,
  rmp: true,
  rmpSummaries: false,
};
const READY = { mailAvailable: true, aiConfigured: true };

describe("landingClaims", () => {
  it("claims every section while each is on and usable", () => {
    expect(landingClaims(ON, READY)).toEqual({
      careers: true,
      alumni: true,
      events: true,
      ai: true,
      ratings: true,
    });
  });

  it("follows each flag", () => {
    expect(landingClaims({ ...ON, careers: false }, READY)).toMatchObject({
      careers: false,
      // Alumni lives under Careers.
      alumni: false,
    });
    expect(landingClaims({ ...ON, alumni: false }, READY).alumni).toBe(false);
    expect(landingClaims({ ...ON, events: false }, READY).events).toBe(false);
    expect(landingClaims({ ...ON, ai: false }, READY).ai).toBe(false);
    expect(landingClaims({ ...ON, rmp: false }, READY).ratings).toBe(false);
  });

  it("claims neither alumni nor AI while no mailbox can be verified", () => {
    expect(landingClaims(ON, { ...READY, mailAvailable: false })).toEqual({
      careers: true,
      alumni: false,
      events: true,
      ai: false,
      ratings: true,
    });
  });

  it("claims AI without mail while the temporary AI_ALLOW_UNVERIFIED switch is on (alumni still need mail)", () => {
    const noMail = { ...READY, mailAvailable: false, aiWithoutVerifying: true };
    expect(landingClaims(ON, noMail)).toMatchObject({ ai: true, alumni: false });
    expect(landingClaims({ ...ON, ai: false }, noMail).ai).toBe(false);
    expect(landingClaims(ON, { ...noMail, aiConfigured: false }).ai).toBe(false);
    expect(landingClaims(ON, { ...noMail, aiWithoutVerifying: false }).ai).toBe(false);
  });

  it("claims no AI while no provider is configured", () => {
    expect(landingClaims(ON, { ...READY, aiConfigured: false }).ai).toBe(false);
  });
});

describe("aiProviderConfigured", () => {
  it("is true for the mock provider or Anthropic with a key, false otherwise", () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(aiProviderConfigured()).toBe(true);
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(aiProviderConfigured()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(aiProviderConfigured()).toBe(true);
  });

  it("reads a rejected configuration as not configured", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(aiProviderConfigured()).toBe(false);
  });
});

describe("loadLandingClaims", () => {
  it("reads the flags, the mailer and the AI setup of this request, and never throws", () => {
    vi.stubEnv("MAIL_PROVIDER", "console");
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(loadLandingClaims()).toEqual({
      careers: true,
      alumni: true,
      events: true,
      ai: true,
      ratings: true,
    });
    vi.stubEnv("FEATURE_EVENTS", "false");
    vi.stubEnv("MAIL_PROVIDER", "none");
    expect(loadLandingClaims()).toMatchObject({ events: false, alumni: false, ai: false });
    // No mail, but the owner's temporary switch lets unverified Davidson accounts use AI: the claim is true again.
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "true");
    expect(loadLandingClaims()).toMatchObject({ alumni: false, ai: true });
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "false");
    // A malformed flag takes its default (logged once by loadFlags).
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FEATURE_CAREERS", "sometimes");
    expect(loadLandingClaims().careers).toBe(true);
  });
});

describe("joinWords", () => {
  it("joins words the way the copy reads", () => {
    expect(joinWords([])).toBe("");
    expect(joinWords(["Deadlines"])).toBe("Deadlines");
    expect(joinWords(["a", "b"])).toBe("a and b");
    expect(joinWords(["a", "b", "c"])).toBe("a, b and c");
  });
});
