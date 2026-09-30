import "server-only";
import { z } from "zod";

/**
 * Server environment, validated with zod and read lazily (PLAN §2 "Env").
 *
 * Nothing here runs at import time, so `next build` (and any module that imports this file) works with no
 * environment variables set. Validation happens on first use:
 *   - `getEnv()` validates every variable once (plus the production checks) and caches the result.
 *   - `readEnv(key)` validates a single variable (plus the production checks about it), for code paths that only
 *     need one (e.g. the DB connection), so an unrelated bad variable cannot take them down.
 * A bad environment therefore fails the request that needs it (a route 500), never the build.
 *
 * Production checks (NODE_ENV=production, i.e. `next start` and every Vercel deployment):
 *   - NEXTAUTH_SECRET is at least 32 characters and not the .env.example placeholder;
 *   - APP_ORIGIN is set (except on Vercel preview deployments, whose origins are per deployment);
 *   - on the Vercel production environment: AI_PROVIDER is not "mock", EXTERNAL_MODE is not "fixtures",
 *     MAIL_PROVIDER is not "console" and FIXTURES_NOW is unset;
 *   - RATE_LIMITS=off only with EXTERNAL_MODE=fixtures (the e2e server) and never on Vercel production.
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

const optionalString = z.preprocess(unsetIfBlank, z.string().optional());

/** The NEXTAUTH_SECRET value shipped in .env.example. Rejected in production. */
export const NEXTAUTH_SECRET_PLACEHOLDER = "replace-with-output-of-openssl-rand-base64-32";

export const DEFAULT_AI_DAILY_TOKEN_BUDGET = 2_000_000;

export const MAIL_PROVIDERS = ["none", "console", "resend"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

const MAIL_FROM_PATTERN =
  /^(?:[^<>@]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/;

export const envSchema = z.object({
  // --- Runtime (set by Node, Next.js and Vercel) -------------------------------------------------------------------
  NODE_ENV: z.preprocess(
    unsetIfBlank,
    z.enum(["development", "production", "test"]).default("development"),
  ),
  VERCEL_ENV: z.preprocess(
    unsetIfBlank,
    z.enum(["production", "preview", "development"]).optional(),
  ),
  VERCEL_URL: optionalString,
  VERCEL_BRANCH_URL: optionalString,

  // --- Core ---------------------------------------------------------------------------------------------------------
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
  /** Public origin of the app (scheme + host [+ port]) for the Origin (CSRF) check; normalised to an origin. */
  APP_ORIGIN: z.preprocess(
    unsetIfBlank,
    z
      .url({
        protocol: /^https?$/,
        error: "must be an absolute origin such as https://make-it-so.vercel.app",
      })
      .transform((value) => new URL(value).origin)
      .optional(),
  ),
  APP_TIMEZONE: z.preprocess(
    unsetIfBlank,
    z
      .string()
      .refine(isValidTimeZone, "must be an IANA time zone such as America/New_York")
      .default("America/New_York"),
  ),

  // --- Jobs and admin -----------------------------------------------------------------------------------------------
  /** Bearer secret Vercel Cron sends; cron routes answer 503 while it is unset. */
  CRON_SECRET: z.preprocess(
    unsetIfBlank,
    z.string().min(16, "must be at least 16 characters (use `openssl rand -hex 32`)").optional(),
  ),
  /** Comma-separated e-mail addresses allowed on admin routes (the account also needs a verified mailbox). */
  ADMIN_EMAILS: z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean)
        : [],
    z.array(z.email({ error: "must be a comma-separated list of e-mail addresses" })),
  ),
  /** "live" calls the real upstream services; "fixtures" serves tests/fixtures/external (tests, e2e, CI). */
  EXTERNAL_MODE: z.preprocess(
    unsetIfBlank,
    z.enum(["live", "fixtures"], { error: 'must be "live" or "fixtures"' }).default("live"),
  ),
  /**
   * Test knob: pins server "now" (server/clock.ts) to this instant, so the fixture world (recorded 2026-09-30) stays
   * current after the real registration term moves on. Honoured only with EXTERNAL_MODE=fixtures; rejected on
   * Vercel production. vitest and Playwright set 2026-09-30T12:00:00-04:00.
   */
  FIXTURES_NOW: z.preprocess(
    unsetIfBlank,
    z.iso
      .datetime({
        offset: true,
        error: "must be an ISO date-time with an offset, e.g. 2026-09-30T12:00:00-04:00",
      })
      .optional(),
  ),
  /**
   * Test knob: "off" skips every rate limit (defineRoute rateLimit and consumeRateLimit), because outside Vercel all
   * requests share one client-IP bucket and the e2e suite registers and signs in dozens of times. Default "on";
   * "off" needs EXTERNAL_MODE=fixtures and is rejected on Vercel production.
   */
  RATE_LIMITS: z.preprocess(
    unsetIfBlank,
    z.enum(["on", "off"], { error: 'must be "on" or "off"' }).default("on"),
  ),

  // --- AI (Anthropic) -----------------------------------------------------------------------------------------------
  ANTHROPIC_API_KEY: optionalString,
  AI_PROVIDER: z.preprocess(
    unsetIfBlank,
    z.enum(["anthropic", "mock"], { error: 'must be "anthropic" or "mock"' }).default("anthropic"),
  ),
  AI_ENABLED: flag(true),
  /** Tokens per day across all users before AI pauses ("AI is paused for today"). */
  AI_DAILY_TOKEN_BUDGET: z.preprocess(
    unsetIfBlank,
    z.coerce
      .number({ error: "must be a whole number of tokens" })
      .int("must be a whole number of tokens")
      .min(0, "must be a whole number of tokens")
      .default(DEFAULT_AI_DAILY_TOKEN_BUDGET),
  ),

  // --- Mail (Davidson mailbox verification) -------------------------------------------------------------------------
  /** Unset → "none" in production, "console" in development and tests (see resolveMailProvider). */
  MAIL_PROVIDER: z.preprocess(
    unsetIfBlank,
    z.enum(MAIL_PROVIDERS, { error: 'must be "none", "console" or "resend"' }).optional(),
  ),
  MAIL_API_KEY: optionalString,
  MAIL_FROM: z.preprocess(
    unsetIfBlank,
    z
      .string()
      .regex(MAIL_FROM_PATTERN, 'must be an address such as "MakeItSo <noreply@example.org>"')
      .optional(),
  ),

  // --- Feature flags (read through lib/flags.ts) --------------------------------------------------------------------
  FEATURE_CAREERS: flag(true),
  FEATURE_EVENTS: flag(true),
  FEATURE_ALUMNI: flag(true),
  RMP_ENABLED: flag(true),
  // AI summaries of RMP reviews are a derivative work and a prompt-poisoning vector: off unless the owner opts in
  // (PLAN §1, §4.1.14).
  RMP_SUMMARIES_ENABLED: flag(false),
});

type ParsedEnv = z.output<typeof envSchema>;

export type Env = Omit<ParsedEnv, "MAIL_PROVIDER"> & { MAIL_PROVIDER: MailProvider };
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
  // `fallbackKey` is set when a single variable was parsed: issue paths are then relative to its value.
  return issues.map((issue) => {
    const key = fallbackKey ?? (issue.path.length > 0 ? String(issue.path[0]) : "(env)");
    return `${key} ${issue.message}`;
  });
}

type EnvSource = Record<string, string | undefined>;

/** MAIL_PROVIDER when unset: "none" in production, "console" (codes logged on the server) otherwise. */
function resolveMailProvider(
  value: MailProvider | undefined,
  nodeEnv: Env["NODE_ENV"],
): MailProvider {
  return value ?? (nodeEnv === "production" ? "none" : "console");
}

interface EnvRule {
  /** The variables this rule is about: readEnv(key) runs the rule when key is listed here. */
  about: readonly EnvKey[];
  /** Other variables the rule reads. */
  reads: readonly EnvKey[];
  check(env: Env): string | null;
}

const RULES: readonly EnvRule[] = [
  {
    about: ["NEXTAUTH_SECRET"],
    reads: ["NODE_ENV"],
    check: (env) =>
      env.NODE_ENV === "production" &&
      (env.NEXTAUTH_SECRET.length < 32 || env.NEXTAUTH_SECRET === NEXTAUTH_SECRET_PLACEHOLDER)
        ? "NEXTAUTH_SECRET must be at least 32 characters and not the .env.example placeholder in production (generate one with `openssl rand -base64 32`)"
        : null,
  },
  {
    about: ["APP_ORIGIN"],
    reads: ["NODE_ENV", "VERCEL_ENV"],
    check: (env) =>
      env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview" && !env.APP_ORIGIN
        ? "APP_ORIGIN is required in production: the public origin, e.g. https://make-it-so.vercel.app"
        : null,
  },
  {
    about: ["AI_PROVIDER"],
    reads: ["VERCEL_ENV"],
    check: (env) =>
      env.VERCEL_ENV === "production" && env.AI_PROVIDER === "mock"
        ? 'AI_PROVIDER must not be "mock" in the Vercel production environment'
        : null,
  },
  {
    about: ["EXTERNAL_MODE"],
    reads: ["VERCEL_ENV"],
    check: (env) =>
      env.VERCEL_ENV === "production" && env.EXTERNAL_MODE === "fixtures"
        ? 'EXTERNAL_MODE must not be "fixtures" in the Vercel production environment'
        : null,
  },
  {
    about: ["FIXTURES_NOW"],
    reads: ["VERCEL_ENV"],
    check: (env) =>
      env.VERCEL_ENV === "production" && env.FIXTURES_NOW
        ? "FIXTURES_NOW must not be set in the Vercel production environment"
        : null,
  },
  {
    about: ["RATE_LIMITS"],
    reads: ["VERCEL_ENV", "EXTERNAL_MODE"],
    check: (env) =>
      env.RATE_LIMITS === "off" &&
      (env.VERCEL_ENV === "production" || env.EXTERNAL_MODE !== "fixtures")
        ? 'RATE_LIMITS=off is a test setting: it needs EXTERNAL_MODE=fixtures and is rejected on Vercel production'
        : null,
  },
  {
    about: ["MAIL_PROVIDER"],
    reads: ["VERCEL_ENV", "MAIL_API_KEY", "MAIL_FROM"],
    check: (env) => {
      if (env.MAIL_PROVIDER === "console" && env.VERCEL_ENV === "production") {
        return 'MAIL_PROVIDER must not be "console" in the Vercel production environment';
      }
      if (env.MAIL_PROVIDER === "resend" && (!env.MAIL_API_KEY || !env.MAIL_FROM)) {
        return 'MAIL_PROVIDER "resend" needs MAIL_API_KEY and MAIL_FROM';
      }
      return null;
    },
  },
];

function finalize(parsed: ParsedEnv): Env {
  return { ...parsed, MAIL_PROVIDER: resolveMailProvider(parsed.MAIL_PROVIDER, parsed.NODE_ENV) };
}

let cached: Env | undefined;

/** Validate every variable once and return the typed environment. Throws EnvError with a readable message. */
export function getEnv(source: EnvSource = process.env): Env {
  if (cached && source === process.env) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) throw new EnvError(describeIssues(result.error.issues));
  const env = finalize(result.data);
  const problems = RULES.map((rule) => rule.check(env)).filter((p): p is string => p !== null);
  if (problems.length > 0) throw new EnvError(problems);
  if (source === process.env) cached = env;
  return env;
}

function parseKey<K extends EnvKey>(key: K, source: EnvSource): Env[K] {
  const result = envSchema.shape[key].safeParse(source[key]);
  if (!result.success) throw new EnvError(describeIssues(result.error.issues, key));
  if (key === "MAIL_PROVIDER") {
    const nodeEnv = envSchema.shape.NODE_ENV.safeParse(source.NODE_ENV);
    return resolveMailProvider(
      result.data as MailProvider | undefined,
      nodeEnv.success ? nodeEnv.data : "development",
    ) as Env[K];
  }
  return result.data as Env[K];
}

/**
 * Validate and return a single variable without requiring the rest of the environment to be valid. The production
 * checks about this variable still apply (they parse only the variables they read).
 */
export function readEnv<K extends EnvKey>(key: K, source: EnvSource = process.env): Env[K] {
  const value = parseKey(key, source);
  for (const rule of RULES) {
    if (!rule.about.includes(key)) continue;
    const partial: Partial<Record<EnvKey, unknown>> = { [key]: value };
    for (const dep of rule.reads) partial[dep] = parseKey(dep, source);
    // The rule only reads `key` and its declared dependencies.
    const problem = rule.check(partial as Env);
    if (problem) throw new EnvError([problem]);
  }
  return value;
}

/** Test helper: forget the cached environment so the next getEnv() re-reads process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
