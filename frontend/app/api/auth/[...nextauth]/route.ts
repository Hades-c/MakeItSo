import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { getAuthOptions } from "@/server/auth/options";

interface NextAuthRouteContext {
  params: Promise<{ nextauth: string[] }>;
}

// Options are resolved per request (lazily) so the build never needs NEXTAUTH_SECRET.
function handler(req: NextRequest, context: NextAuthRouteContext): Promise<Response> {
  return NextAuth(req, context, getAuthOptions());
}

export { handler as GET, handler as POST };
