import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvError, getEnv, readEnv, resetEnvCache } from "@/server/env";

const valid = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/makeitso",
  NEXTAUTH_SECRET: "a-very-secret-value",
};

afterEach(() => {
  resetEnvCache();
});

describe("getEnv", () => {
  it("applies defaults for optional settings", () => {
    const env = getEnv(valid);
    expect(env).toEqual({
      MONGODB_URI: valid.MONGODB_URI,
      NEXTAUTH_SECRET: valid.NEXTAUTH_SECRET,
      NEXTAUTH_URL: undefined,
      ANTHROPIC_API_KEY: undefined,
      AI_PROVIDER: "anthropic",
      APP_TIMEZONE: "America/New_York",
      RMP_ENABLED: true,
      RMP_SUMMARIES_ENABLED: false,
    });
  });

  it("parses every supported variable", () => {
    const env = getEnv({
      ...valid,
      MONGODB_URI: "mongodb+srv://user:pw@cluster0.example.mongodb.net/makeitso",
      NEXTAUTH_URL: "https://make-it-so.vercel.app",
      ANTHROPIC_API_KEY: "sk-ant-test",
      AI_PROVIDER: "mock",
      APP_TIMEZONE: "Europe/London",
      RMP_ENABLED: "false",
      RMP_SUMMARIES_ENABLED: "1",
    });
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.APP_TIMEZONE).toBe("Europe/London");
    expect(env.NEXTAUTH_URL).toBe("https://make-it-so.vercel.app");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(env.RMP_ENABLED).toBe(false);
    expect(env.RMP_SUMMARIES_ENABLED).toBe(true);
  });

  it("treats blank values as unset", () => {
    const env = getEnv({ ...valid, AI_PROVIDER: "", APP_TIMEZONE: "  ", NEXTAUTH_URL: "" });
    expect(env.AI_PROVIDER).toBe("anthropic");
    expect(env.APP_TIMEZONE).toBe("America/New_York");
    expect(env.NEXTAUTH_URL).toBeUndefined();
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
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const { message, problems } = error as EnvError;
    expect(problems).toHaveLength(5);
    expect(message).toMatch(/MONGODB_URI must start with mongodb:\/\//);
    expect(message).toMatch(/AI_PROVIDER must be "anthropic" or "mock"/);
    expect(message).toMatch(/APP_TIMEZONE must be an IANA time zone/);
    expect(message).toMatch(/NEXTAUTH_URL must be an absolute URL/);
    expect(message).toMatch(/RMP_ENABLED must be a boolean/);
    expect(message).not.toContain("secret-password");
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

describe("readEnv", () => {
  it("validates a single variable without needing the others", () => {
    expect(readEnv("APP_TIMEZONE", {})).toBe("America/New_York");
    expect(readEnv("AI_PROVIDER", { AI_PROVIDER: "mock" })).toBe("mock");
    expect(readEnv("MONGODB_URI", { MONGODB_URI: valid.MONGODB_URI })).toBe(valid.MONGODB_URI);
  });

  it("names the variable in the error", () => {
    expect(() => readEnv("NEXTAUTH_SECRET", {})).toThrow(EnvError);
    expect(() => readEnv("NEXTAUTH_SECRET", {})).toThrow(/NEXTAUTH_SECRET is required/);
  });
});
