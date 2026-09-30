import type { DefaultSession } from "next-auth";

// Type augmentation so `session.user.id` and `token.id` are typed everywhere (no casts). `sessionVersion` / `sv`
// carry the account's session version from sign-in time (server/auth/session.ts compares it on every request).
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; sessionVersion?: number };
  }

  interface User {
    id: string;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    sv?: number;
  }
}
