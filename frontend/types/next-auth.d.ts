import type { DefaultSession } from "next-auth";

// Type augmentation so `session.user.id` and `token.id` are typed everywhere (no casts).
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
  }

  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
