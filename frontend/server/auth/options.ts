import "server-only";
import bcrypt from "bcryptjs";
import type { NextAuthOptions, User as AuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import User from "@/models/User";
import { getDb } from "@/server/db";
import { readEnv } from "@/server/env";

/**
 * NextAuth (v4) configuration: email + password credentials, JWT sessions.
 *
 * Built lazily by getAuthOptions() so that importing this module (e.g. while `next build` collects route data)
 * never reads or validates environment variables.
 */

/** Shown for every failed sign-in so the response does not reveal whether an account exists. */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

/**
 * bcrypt hash of a throwaway password (cost 12, same as real hashes). Compared against when no account exists so
 * that "unknown email" and "wrong password" take roughly the same time.
 */
const DUMMY_PASSWORD_HASH = "$2b$12$gNrJS2r3FIW85WDa5/6Hc..yhwC72fiXejL0onpbw3tQ4XRkRks3a";

export interface CredentialsInput {
  email?: string;
  password?: string;
}

/** Verify email + password. Returns the session user, or null when the credentials are wrong. */
export async function authorizeCredentials(
  credentials: CredentialsInput | undefined,
): Promise<AuthUser | null> {
  const email = credentials?.email?.trim().toLowerCase();
  const password = credentials?.password;
  if (!email || !password) return null;

  await getDb();
  const user = await User.findOne({ email }).select("+password").lean();

  if (!user?.password) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return null;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return { id: user._id.toString(), email: user.email, name: user.name };
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
        async authorize(credentials) {
          try {
            return await authorizeCredentials(credentials);
          } catch (error) {
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
        }
        // Re-read name/email when the client calls update() after a profile change.
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
    },
  };
}

let authOptions: NextAuthOptions | undefined;

/** The NextAuth options. Validates NEXTAUTH_SECRET on first call (throws EnvError with a clear message). */
export function getAuthOptions(): NextAuthOptions {
  authOptions ??= buildAuthOptions(readEnv("NEXTAUTH_SECRET"));
  return authOptions;
}
