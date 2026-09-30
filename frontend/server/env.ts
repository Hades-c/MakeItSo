import "server-only";
import { z } from "zod";

/**
 * Server environment, validated with zod and read lazily.
 *
 * Nothing here runs at import time, so `next build` (and any module that imports this file) works with no
 * environment variables set. Validation happens on first use:
 *   - `getEnv()` validates every variable once and caches the result.
 *   - `readEnv(key)` validates a single variable, for code paths that only need one (e.g. the DB connection).
 */

/** Treat empty or whitespace-only values (common in copied .env files) as "not set". */
const unsetIfBlank = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const flag = (defaultValue: boolean) =>
  z.preprocess(
    unsetIfBlank,
    z.stringbool({ error: 'must be a boolean such as "true" or "false"' }).default(defaultValue),
  );

export const envSchema = z.object({
  MONGODB_URI: z.preprocess(
    unsetIfBlank,
    z
      .string({
        error: "is required: a MongoDB connection string, e.g. mongodb://127.0.0.1:27017/makeitso",
      })
      .regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
  ),
  NEXTAUTH_SECRET: z.preprocess(
    unsetIfBlank,
    z.string({ error: "is required: generate one with `openssl rand -base64 32`" }),
  ),
  NEXTAUTH_URL: z.preprocess(
    unsetIfBlank,
    z.url({ error: "must be an absolute URL such as http://localhost:3000" }).optional(),
  ),
  ANTHROPIC_API_KEY: z.preprocess(unsetIfBlank, z.string().optional()),
  AI_PROVIDER: z.preprocess(
    unsetIfBlank,
    z.enum(["anthropic", "mock"], { error: 'must be "anthropic" or "mock"' }).default("anthropic"),
  ),
  APP_TIMEZONE: z.preprocess(
    unsetIfBlank,
    z
      .string()
      .refine(isValidTimeZone, "must be an IANA time zone such as America/New_York")
      .default("America/New_York"),
  ),
  RMP_ENABLED: flag(true),
  // AI summaries of RMP reviews are a derivative work and a prompt-poisoning vector: off unless the owner opts in
  // (PLAN §1, §4.1.14).
  RMP_SUMMARIES_ENABLED: flag(false),
});

export type Env = z.infer<typeof envSchema>;
export type EnvKey = keyof Env;

export class EnvError extends Error {
  readonly problems: readonly string[];

  constructor(problems: string[]) {
    super(
      [
        "Invalid server environment configuration:",
        ...problems.map((p) => `  - ${p}`),
        "Set these in frontend/.env.local for local development (see frontend/.env.example),",
        "or in your hosting provider's environment variable settings.",
      ].join("\n"),
    );
    this.name = "EnvError";
    this.problems = problems;
  }
}

function describeIssues(issues: z.core.$ZodIssue[], fallbackKey?: string): string[] {
  // Never echo the offending values: several of these variables are secrets.
  return issues.map((issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : (fallbackKey ?? "(env)");
    return `${key} ${issue.message}`;
  });
}

type EnvSource = Record<string, string | undefined>;

let cached: Env | undefined;

/** Validate every variable once and return the typed environment. Throws EnvError with a readable message. */
export function getEnv(source: EnvSource = process.env): Env {
  if (cached && source === process.env) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) throw new EnvError(describeIssues(result.error.issues));
  if (source === process.env) cached = result.data;
  return result.data;
}

/** Validate and return a single variable without requiring the rest of the environment to be valid. */
export function readEnv<K extends EnvKey>(key: K, source: EnvSource = process.env): Env[K] {
  const schema = envSchema.shape[key];
  const result = schema.safeParse(source[key]);
  if (!result.success) throw new EnvError(describeIssues(result.error.issues, key));
  return result.data as Env[K];
}

/** Test helper: forget the cached environment so the next getEnv() re-reads process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
