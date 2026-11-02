import { accountApi } from "@/lib/api/account";
import { confirmPasswordReset } from "@/server/auth";
import { RESET_CONFIRM_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * POST /api/auth/password-reset/confirm: address + code + new password → 200 { startedFresh } (true when the reset
 * started a pending sign-up fresh). Every code failure is the same 400, whether or not the address has an account;
 * 10 per 15 minutes per client IP.
 */
export const POST = defineRoute(
  { ...accountApi.confirmPasswordReset, rateLimit: RESET_CONFIRM_RULE },
  async ({ body }) => confirmPasswordReset(body.email, body.code, body.newPassword),
);
