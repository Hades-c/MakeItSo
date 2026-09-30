import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EnvError,
  getEnv,
  NEXTAUTH_SECRET_PLACEHOLDER,
  readEnv,
  resetEnvCache,
} from "@/server/env";

const valid = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/makeitso",
  NEXTAUTH_SECRET: "a-very-secret-value",
};

/** A production environment that passes every production check. */
const production = {
  ...valid,
  NODE_ENV: "production",
  NEXTAUTH_SECRET: "x".repeat(32),
  APP_ORIGIN: "https://make-it-so.vercel.app",
};

function problemsOf(fn: () => unknown): readonly string[] {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return (error as EnvError).problems;
  }
  throw new Error("expected an EnvError");
}

afterEach(() => {
  resetEnvCache();
});

describe("getEnv", () => {
  it("applies defaults for optional settings", () => {
    const env = getEnv(valid);
    expect(env).toEqual({
      NODE_ENV: "development",
      VERCEL_ENV: undefined,
      VERCEL_URL: undefined,
      VERCEL_BRANCH_URL: undefined,
      MONGODB_URI: valid.MONGODB_URI,
      NEXTAUTH_SECRET: valid.NEXTAUTH_SECRET,
      NEXTAUTH_URL: undefined,
      APP_ORIGIN: undefined,
      APP_TIMEZONE: "America/New_York",
      CRON_SECRET: undefined,
      ADMIN_EMAILS: [],
      EXTERNAL_MODE: "live",
      ANTHROPIC_API_KEY: undefined,
      AI_PROVIDER: "anthropic",
      AI_ENABLED: true,
      AI_DAILY_TOKEN_BUDGET: 2_000_000,
      MAIL_PROVIDER: "console",
      MAIL_API_KEY: undefined,
      MAIL_FROM: undefined,
      FEATURE_CAREERS: true,
      FEATURE_EVENTS: true,
      FEATURE_ALUMNI: true,
      RMP_ENABLED: true,
      RMP_SUMMARIES_ENABLED: false,
    });
  });

  it("parses every supported variable", () => {
    const env = getEnv({
      ...valid,
      MONGODB_URI: "mongodb+srv://user:pw@cluster0.example.mongodb.net/makeitso",
      NEXTAUTH_URL: "https://make-it-so.vercel.app",
      APP_ORIGIN: "https://make-it-so.vercel.app/some/path?x=1",
      ANTHROPIC_API_KEY: "sk-ant-test",
      AI_PROVIDER: "mock",
      AI_ENABLED: "false",
      AI_DAILY_TOKEN_BUDGET: "500000",
      APP_TIMEZONE: "Europe/London",
      CRON_SECRET: "0123456789abcdef0123",
      ADMIN_EMAILS: " Owner@Davidson.edu , second@example.org,",
      EXTERNAL_MODE: "fixtures",
      MAIL_PROVIDER: "resend",
      MAIL_API_KEY: "re_test",
      MAIL_FROM: "MakeItSo <noreply@example.org>",
      FEATURE_CAREERS: "false",
      FEATURE_EVENTS: "0",
      FEATURE_ALUMNI: "no",
      RMP_ENABLED: "false",
      RMP_SUMMARIES_ENABLED: "1",
    });
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.AI_ENABLED).toBe(false);
    expect(env.AI_DAILY_TOKEN_BUDGET).toBe(500_000);
    expect(env.APP_TIMEZONE).toBe("Europe/London");
    expect(env.NEXTAUTH_URL).toBe("https://make-it-so.vercel.app");
    expect(env.APP_ORIGIN).toBe("https://make-it-so.vercel.app");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(env.CRON_SECRET).toBe("0123456789abcdef0123");
    expect(env.ADMIN_EMAILS).toEqual(["owner@davidson.edu", "second@example.org"]);
    expect(env.EXTERNAL_MODE).toBe("fixtures");
    expect(env.MAIL_PROVIDER).toBe("resend");
    expect(env.MAIL_FROM).toBe("MakeItSo <noreply@example.org>");
    expect([env.FEATURE_CAREERS, env.FEATURE_EVENTS, env.FEATURE_ALUMNI]).toEqual([
      false,
      false,
      false,
    ]);
    expect(env.RMP_ENABLED).toBe(false);
    expect(env.RMP_SUMMARIES_ENABLED).toBe(true);
  });

  it("treats blank values as unset", () => {
    const env = getEnv({
      ...valid,
      AI_PROVIDER: "",
      APP_TIMEZONE: "  ",
      NEXTAUTH_URL: "",
      APP_ORIGIN: " ",
      ADMIN_EMAILS: "",
    });
    expect(env.AI_PROVIDER).toBe("anthropic");
    expect(env.APP_TIMEZONE).toBe("America/New_York");
    expect(env.NEXTAUTH_URL).toBeUndefined();
    expect(env.APP_ORIGIN).toBeUndefined();
    expect(env.ADMIN_EMAILS).toEqual([]);
  });

  it("defaults MAIL_PROVIDER to console in development and tests, none in production", () => {
    expect(getEnv({ ...valid, NODE_ENV: "test" }).MAIL_PROVIDER).toBe("console");
    expect(getEnv(production).MAIL_PROVIDER).toBe("none");
  });

  it("lists every missing required variable in one readable error", () => {
    let error: unknown;
    try {
      getEnv({ MONGODB_URI: " " });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const { message, problems } = error as EnvError;
    expect(problems).toHaveLength(2);
    expect(message).toContain("MONGODB_URI is required");
    expect(message).toContain("NEXTAUTH_SECRET is required");
    expect(message).toContain(".env.example");
  });

  it("rejects malformed values without echoing them", () => {
    let error: unknown;
    try {
      getEnv({
        ...valid,
        MONGODB_URI: "postgres://secret-password@db",
        AI_PROVIDER: "gemini",
        APP_TIMEZONE: "Mars/Olympus_Mons",
        NEXTAUTH_URL: "not a url",
        RMP_ENABLED: "sometimes",
        EXTERNAL_MODE: "offline",
        CRON_SECRET: "short-secret",
        AI_DAILY_TOKEN_BUDGET: "lots",
        ADMIN_EMAILS: "owner@davidson.edu, not-an-email",
        MAIL_PROVIDER: "carrier-pigeon",
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const { message, problems } = error as EnvError;
    expect(problems).toHaveLength(10);
    expect(message).toMatch(/MONGODB_URI must start with mongodb:\/\//);
    expect(message).toMatch(/AI_PROVIDER must be "anthropic" or "mock"/);
    expect(message).toMatch(/APP_TIMEZONE must be an IANA time zone/);
    expect(message).toMatch(/NEXTAUTH_URL must be an absolute URL/);
    expect(message).toMatch(/RMP_ENABLED must be a boolean/);
    expect(message).toMatch(/EXTERNAL_MODE must be "live" or "fixtures"/);
    expect(message).toMatch(/CRON_SECRET must be at least 16 characters/);
    expect(message).toMatch(/AI_DAILY_TOKEN_BUDGET must be a whole number/);
    expect(message).toMatch(/ADMIN_EMAILS must be a comma-separated list/);
    expect(message).toMatch(/MAIL_PROVIDER must be "none", "console" or "resend"/);
    expect(message).not.toContain("secret-password");
    expect(message).not.toContain("short-secret");
  });

  it("reads process.env lazily and caches the result until reset", () => {
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/first");
    vi.stubEnv("NEXTAUTH_SECRET", "s");
    expect(getEnv().MONGODB_URI).toBe("mongodb://127.0.0.1:27017/first");

    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/second");
    expect(getEnv().MONGODB_URI).toBe("mongodb://127.0.0.1:27017/first");

    resetEnvCache();
    expect(getEnv().MONGODB_URI).toBe("mongodb://127.0.0.1:27017/second");
  });
});

describe("production checks (PLAN §2)", () => {
  it("accepts a complete production environment", () => {
    expect(getEnv(production).NODE_ENV).toBe("production");
  });

  it("requires a long, non-placeholder NEXTAUTH_SECRET in production", () => {
    expect(problemsOf(() => getEnv({ ...production, NEXTAUTH_SECRET: "too-short" }))).toEqual([
      expect.stringMatching(/NEXTAUTH_SECRET must be at least 32 characters/),
    ]);
    expect(
      problemsOf(() => getEnv({ ...production, NEXTAUTH_SECRET: NEXTAUTH_SECRET_PLACEHOLDER })),
    ).toHaveLength(1);
    expect(NEXTAUTH_SECRET_PLACEHOLDER.length).toBeGreaterThanOrEqual(32);
    // Short secrets are fine outside production.
    expect(getEnv({ ...valid, NEXTAUTH_SECRET: "dev" }).NEXTAUTH_SECRET).toBe("dev");
  });

  it("requires APP_ORIGIN in production, except on Vercel preview deployments", () => {
    const { APP_ORIGIN: _omit, ...withoutOrigin } = production;
    expect(problemsOf(() => getEnv(withoutOrigin))).toEqual([
      expect.stringMatching(/APP_ORIGIN is required in production/),
    ]);
    expect(getEnv({ ...withoutOrigin, VERCEL_ENV: "preview" }).APP_ORIGIN).toBeUndefined();
  });

  it("rejects mock AI, fixtures and the console mailer on Vercel production", () => {
    const problems = problemsOf(() =>
      getEnv({
        ...production,
        VERCEL_ENV: "production",
        AI_PROVIDER: "mock",
        EXTERNAL_MODE: "fixtures",
        MAIL_PROVIDER: "console",
      }),
    );
    expect(problems).toHaveLength(3);
    // Previews may use the mock provider (PLAN §8) and `next start` (e2e) may use fixtures.
    expect(getEnv({ ...production, VERCEL_ENV: "preview", AI_PROVIDER: "mock" }).AI_PROVIDER).toBe(
      "mock",
    );
    expect(getEnv({ ...production, EXTERNAL_MODE: "fixtures" }).EXTERNAL_MODE).toBe("fixtures");
  });

  it("requires MAIL_API_KEY and MAIL_FROM for the resend mailer", () => {
    expect(problemsOf(() => getEnv({ ...valid, MAIL_PROVIDER: "resend" }))).toEqual([
      'MAIL_PROVIDER "resend" needs MAIL_API_KEY and MAIL_FROM',
    ]);
  });

  it("applies the checks about a variable in readEnv too", () => {
    expect(() => readEnv("NEXTAUTH_SECRET", { ...production, NEXTAUTH_SECRET: "short" })).toThrow(
      /at least 32 characters/,
    );
    expect(() => readEnv("APP_ORIGIN", { NODE_ENV: "production" })).toThrow(/APP_ORIGIN/);
    expect(() => readEnv("AI_PROVIDER", { VERCEL_ENV: "production", AI_PROVIDER: "mock" })).toThrow(
      /mock/,
    );
    // Unrelated variables are not needed: MONGODB_URI can be read with a weak secret around.
    expect(
      readEnv("MONGODB_URI", {
        NODE_ENV: "production",
        NEXTAUTH_SECRET: "short",
        MONGODB_URI: valid.MONGODB_URI,
      }),
    ).toBe(valid.MONGODB_URI);
  });
});

describe("readEnv", () => {
  it("validates a single variable without needing the others", () => {
    expect(readEnv("APP_TIMEZONE", {})).toBe("America/New_York");
    expect(readEnv("AI_PROVIDER", { AI_PROVIDER: "mock" })).toBe("mock");
    expect(readEnv("MONGODB_URI", { MONGODB_URI: valid.MONGODB_URI })).toBe(valid.MONGODB_URI);
    expect(readEnv("EXTERNAL_MODE", {})).toBe("live");
    expect(readEnv("MAIL_PROVIDER", { NODE_ENV: "production" })).toBe("none");
    expect(readEnv("MAIL_PROVIDER", {})).toBe("console");
    expect(readEnv("ADMIN_EMAILS", { ADMIN_EMAILS: "A@davidson.edu" })).toEqual(["a@davidson.edu"]);
  });

  it("names the variable in the error", () => {
    expect(() => readEnv("NEXTAUTH_SECRET", {})).toThrow(EnvError);
    expect(() => readEnv("NEXTAUTH_SECRET", {})).toThrow(/NEXTAUTH_SECRET is required/);
    expect(() => readEnv("ADMIN_EMAILS", { ADMIN_EMAILS: "nope" })).toThrow(
      /ADMIN_EMAILS must be a comma-separated list/,
    );
  });
});
