import "server-only";
import type { NextAuthOptions, User as AuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { normalizeEmail } from "@/lib/api/account";
import User from "@/models/User";
import { verifyPassword } from "@/server/auth/passwords";
import {
  clearLoginFailures,
  consumeLoginIpLimit,
  describeWait,
  loginBackoffStatus,
  recordLoginFailure,
} from "@/server/auth/rate-limits";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { readEnv } from "@/server/env";
import { clientIp } from "@/server/http/rate-limit";

/**
 * NextAuth (v4) configuration: email + password credentials, 14-day JWT sessions (PLAN §6.1 W3).
 *
 * Built lazily by getAuthOptions() so that importing this module (e.g. while `next build` collects route data)
 * never reads or validates environment variables.
 *
 * Sign-in (authorizeCredentials):
 *   - NO domain check: legacy non-Davidson accounts keep working (PLAN §1). The address is looked up normalised
 *     (NFKC → trim → lower case), then as the legacy stored form (trim → lower case) when that differs.
 *   - Unknown address → a dummy bcrypt comparison, so both failures cost the same; one message for both.
 *   - 10 attempts per 15 minutes per client IP; per-address backoff after 5 failures (server/auth/rate-limits.ts).
 *     Refusals are SignInRefusedError, whose message the login form shows.
 *   - The JWT records the account's sessionVersion (`sv`); server/auth/session.ts compares it on every request.
 */

/** Shown for every failed sign-in so the response does not reveal whether an account exists. */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

/** 14 days. */
export const SESSION_MAX_AGE_SEC = 14 * 24 * 60 * 60;

/** A sign-in refused before the password was checked (rate limit, backoff). The message is shown as is. */
export class SignInRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInRefusedError";
  }
}

export interface CredentialsInput {
  email?: string;
  password?: string;
}

export interface AuthorizeContext {
  /** The sign-in request's headers (for the client IP on Vercel). */
  headers?: Headers | Readonly<Record<string, unknown>>;
}

/** Longest input considered at all (the password policy caps new passwords at 72 bytes). */
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;

/** The only request headers the client-IP rule reads. */
const IP_HEADERS = ["x-real-ip", "x-forwarded-for"] as const;

function toHeaders(input: AuthorizeContext["headers"]): Headers {
  const headers = new Headers();
  for (const name of IP_HEADERS) {
    const raw: unknown =
      input instanceof Headers ? input.get(name) : (input?.[name] ?? input?.[name.toUpperCase()]);
    const value = Array.isArray(raw) ? (raw[0] as unknown) : raw;
    if (typeof value !== "string") continue;
    try {
      headers.set(name, value);
    } catch {
      // Not a valid header value: ignore it (the IP falls back to "unknown" on Vercel).
    }
  }
  return headers;
}

/** Client IP for the sign-in limit, by the shared rule (x-real-ip / first X-Forwarded-For only on Vercel). */
export function signInClientIp(context: AuthorizeContext = {}): string {
  return clientIp(new Request("http://sign-in.invalid/", { headers: toHeaders(context.headers) }));
}

const ACCOUNT_FIELDS = "+password name email sessionVersion emailVerifiedAt";

/**
 * The account for a typed address: the normalised form first, then the raw legacy form (trimmed, lower-cased,
 * without NFKC) that hackathon-era sign-ups stored.
 */
export async function findAccountByEmail(input: string) {
  await getDb();
  const normalized = normalizeEmail(input);
  const found = await User.findOne({ email: normalized }).select(ACCOUNT_FIELDS).lean();
  const legacy = input.trim().toLowerCase();
  if (found || legacy === normalized) return found;
  return User.findOne({ email: legacy }).select(ACCOUNT_FIELDS).lean();
}

/** Verify email + password. Returns the session user, or null when the credentials are wrong. */
export async function authorizeCredentials(
  credentials: CredentialsInput | undefined,
  context: AuthorizeContext = {},
): Promise<AuthUser | null> {
  const rawEmail = credentials?.email;
  const password = credentials?.password;
  if (typeof rawEmail !== "string" || typeof password !== "string") return null;
  if (!rawEmail.trim() || !password) return null;
  if (rawEmail.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) return null;

  const email = normalizeEmail(rawEmail);
  const at = now();

  const ipLimit = await consumeLoginIpLimit(signInClientIp(context), at);
  if (!ipLimit.allowed) {
    throw new SignInRefusedError(
      `Too many sign-in attempts. Wait ${describeWait(ipLimit.retryAfterSec)} and try again.`,
    );
  }
  const backoff = await loginBackoffStatus(email, at);
  if (backoff.blocked) {
    throw new SignInRefusedError(
      `Too many failed sign-in attempts for this address. Wait ${describeWait(backoff.retryAfterSec)} and try again.`,
    );
  }

  const user = await findAccountByEmail(rawEmail);
  // verifyPassword compares against a dummy hash when there is no account (same cost either way).
  const valid = await verifyPassword(password, user?.password);
  if (!user || !valid) {
    await recordLoginFailure(email, at);
    return null;
  }
  await clearLoginFailures(email);
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion ?? 0,
  };
}

function buildAuthOptions(secret: string): NextAuthOptions {
  return {
    secret,
    providers: [
      CredentialsProvider({
        name: "credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials, req) {
          try {
            return await authorizeCredentials(credentials, { headers: req?.headers });
          } catch (error) {
            if (error instanceof SignInRefusedError) throw error;
            // Database/config problems: log the details server-side, show the user something generic.
            console.error("[auth] sign-in failed:", error);
            throw new Error("Sign-in is temporarily unavailable. Please try again in a moment.");
          }
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user, trigger }) {
        if (user) {
          token.id = user.id;
          token.name = user.name;
          token.email = user.email;
          token.sv = user.sessionVersion ?? 0;
        }
        // Re-read name/email when the client calls update() after a profile change. Never the session version:
        // a revoked token must not be able to refresh itself.
        if (trigger === "update" && token.id) {
          await getDb();
          const dbUser = await User.findById(token.id).select("name email").lean();
          if (dbUser) {
            token.name = dbUser.name;
            token.email = dbUser.email;
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.id) {
          session.user.id = token.id;
          session.user.name = token.name ?? session.user.name;
          session.user.email = token.email ?? session.user.email;
          session.user.sessionVersion = token.sv ?? 0;
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SEC,
    },
    jwt: {
      maxAge: SESSION_MAX_AGE_SEC,
    },
  };
}

let authOptions: NextAuthOptions | undefined;

/** The NextAuth options. Validates NEXTAUTH_SECRET on first call (throws EnvError with a clear message). */
export function getAuthOptions(): NextAuthOptions {
  authOptions ??= buildAuthOptions(readEnv("NEXTAUTH_SECRET"));
  return authOptions;
}
