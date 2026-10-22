import { accountApi } from "@/lib/api/account";
import { registerAccount } from "@/server/auth";
import { REGISTER_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * POST /api/auth/register (accountApi.register; PLAN §1 "Sign-up"). @davidson.edu only, 5 per hour per client
 * IP, and always 202 `{ status: "check-inbox", message }`: the answer never says whether the address already has
 * an account (server/auth/registration.ts). Only the new-password policy can reject a valid body (400).
 */
export const POST = defineRoute(
  { ...accountApi.register, rateLimit: REGISTER_RULE },
  async ({ body }) => registerAccount(body),
);
