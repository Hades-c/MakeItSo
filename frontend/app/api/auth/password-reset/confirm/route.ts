import { authExtraApi } from "@/app/(auth)/_lib/contracts";
import { confirmPasswordReset } from "@/server/auth";
import { RESET_CONFIRM_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * POST /api/auth/password-reset/confirm: address + code + new password → 204. Every code failure is the same
 * 400, whether or not the address has an account; 10 per 15 minutes per client IP.
 */
export const POST = defineRoute(
  { ...authExtraApi.confirmPasswordReset, rateLimit: RESET_CONFIRM_RULE },
  async ({ body }) => {
    await confirmPasswordReset(body.email, body.code, body.newPassword);
    return null;
  },
);
