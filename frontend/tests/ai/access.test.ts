import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_FEATURES } from "@/lib/types/ai";
import {
  ALUMNI_VERIFIED_ONLY_MESSAGE,
  UNVERIFIED_AI_ALLOWED_MESSAGE,
  UNVERIFIED_MESSAGE,
  verifiedOnlyMessage,
} from "@/lib/types/ai-constants";
import {
  aiAllowsUnverified,
  aiOpenWithoutVerifying,
  aiUnverifiedMessage,
  isAiVerified,
  loadAiAllowsUnverified,
  VERIFIED_ONLY_AI_FEATURES,
} from "@/server/ai/access";
import { EnvError } from "@/server/env";

/**
 * Who counts as verified for AI (server/ai/access.ts), in both states of the owner's temporary AI_ALLOW_UNVERIFIED
 * switch: the one rule aiGateInput and the pages share.
 */

const VERIFIED_AT = "2026-09-01T12:00:00.000Z";
const ACCOUNTS = {
  verifiedDavidson: { email: "sam@davidson.edu", emailVerifiedAt: VERIFIED_AT },
  unverifiedDavidson: { email: "sam@davidson.edu", emailVerifiedAt: null },
  unverifiedOther: { email: "sam@gmail.com", emailVerifiedAt: null },
  verifiedLegacyOther: { email: "legacy@gmail.com", emailVerifiedAt: new Date(VERIFIED_AT) },
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAiVerified", () => {
  it("switch off: a verified @davidson.edu mailbox only, for every feature", () => {
    for (const feature of AI_FEATURES) {
      expect(isAiVerified(ACCOUNTS.verifiedDavidson, feature, false), feature).toBe(true);
      expect(isAiVerified(ACCOUNTS.unverifiedDavidson, feature, false), feature).toBe(false);
      expect(isAiVerified(ACCOUNTS.unverifiedOther, feature, false), feature).toBe(false);
      expect(isAiVerified(ACCOUNTS.verifiedLegacyOther, feature, false), feature).toBe(false);
    }
  });

  it("switch on: any @davidson.edu address, except for cold e-mail; other addresses never", () => {
    for (const feature of AI_FEATURES) {
      const verifiedOnly = feature === "cold-email";
      expect(isAiVerified(ACCOUNTS.verifiedDavidson, feature, true), feature).toBe(true);
      expect(isAiVerified(ACCOUNTS.unverifiedDavidson, feature, true), feature).toBe(!verifiedOnly);
      expect(isAiVerified(ACCOUNTS.unverifiedOther, feature, true), feature).toBe(false);
      expect(isAiVerified(ACCOUNTS.verifiedLegacyOther, feature, true), feature).toBe(false);
    }
    expect(VERIFIED_ONLY_AI_FEATURES).toEqual(["cold-email"]);
  });

  it("normalises the address like sign-up, and refuses no account at all", () => {
    expect(
      isAiVerified({ email: " Sam@Davidson.EDU ", emailVerifiedAt: null }, "course-about", true),
    ).toBe(true);
    expect(isAiVerified({ email: "sam@davidson.edu.evil.example" }, "course-about", true)).toBe(
      false,
    );
    expect(isAiVerified(null, "course-about", true)).toBe(false);
    expect(isAiVerified(undefined, "course-about", true)).toBe(false);
    expect(isAiVerified({}, "course-about", true)).toBe(false);
  });
});

describe("the messages", () => {
  it("say what is true in each state of the switch", () => {
    expect(verifiedOnlyMessage(false)).toBe(UNVERIFIED_MESSAGE);
    expect(verifiedOnlyMessage(true)).toBe(UNVERIFIED_AI_ALLOWED_MESSAGE);
    expect(UNVERIFIED_MESSAGE).toMatch(/AI features are limited to verified @davidson\.edu/);
    expect(UNVERIFIED_AI_ALLOWED_MESSAGE).toMatch(
      /^AI features are limited to @davidson\.edu accounts/,
    );
    expect(UNVERIFIED_AI_ALLOWED_MESSAGE).toMatch(
      /alumni network and cold-email drafts to verified/,
    );
    for (const feature of AI_FEATURES) {
      expect(aiUnverifiedMessage(feature, false)).toBe(UNVERIFIED_MESSAGE);
      expect(aiUnverifiedMessage(feature, true)).toBe(
        feature === "cold-email" ? ALUMNI_VERIFIED_ONLY_MESSAGE : UNVERIFIED_AI_ALLOWED_MESSAGE,
      );
    }
  });
});

describe("the switch (AI_ALLOW_UNVERIFIED)", () => {
  it("is off by default and reads like the other boolean flags", () => {
    expect(aiAllowsUnverified({})).toBe(false);
    expect(aiAllowsUnverified({ AI_ALLOW_UNVERIFIED: " " })).toBe(false);
    expect(aiAllowsUnverified({ AI_ALLOW_UNVERIFIED: "true" })).toBe(true);
    expect(aiAllowsUnverified({ AI_ALLOW_UNVERIFIED: "false" })).toBe(false);
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "true");
    expect(aiAllowsUnverified()).toBe(true);
    expect(loadAiAllowsUnverified()).toBe(true);
  });

  it("a malformed value fails a route (EnvError) but reads as off on pages, logged once", () => {
    expect(() => aiAllowsUnverified({ AI_ALLOW_UNVERIFIED: "sometimes" })).toThrow(EnvError);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(loadAiAllowsUnverified({ AI_ALLOW_UNVERIFIED: "sometimes" })).toBe(false);
    expect(loadAiAllowsUnverified({ AI_ALLOW_UNVERIFIED: "sometimes" })).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.flat().join(" ")).toMatch(/AI_ALLOW_UNVERIFIED/);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/sometimes/);
  });
});

describe("aiOpenWithoutVerifying (what copy may promise)", () => {
  it("needs the switch AND AI working: AI_ENABLED and a configured provider", () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(aiOpenWithoutVerifying()).toBe(false);
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "true");
    expect(aiOpenWithoutVerifying()).toBe(true);
    // The switch value can be passed in by a caller that already read it.
    expect(aiOpenWithoutVerifying(false)).toBe(false);
    vi.stubEnv("AI_ENABLED", "false");
    expect(aiOpenWithoutVerifying()).toBe(false);
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(aiOpenWithoutVerifying()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    expect(aiOpenWithoutVerifying()).toBe(true);
  });

  it("never throws: a malformed flag reads as off", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "true");
    vi.stubEnv("AI_ENABLED", "maybe");
    // A malformed AI_ENABLED takes its default (on), like every page.
    expect(aiOpenWithoutVerifying()).toBe(true);
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "sometimes");
    expect(aiOpenWithoutVerifying()).toBe(false);
  });
});
