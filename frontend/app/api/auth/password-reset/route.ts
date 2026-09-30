import { authExtraApi } from "@/app/(auth)/_lib/contracts";
import { requestPasswordReset } from "@/server/auth";
import { RESET_REQUEST_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * POST /api/auth/password-reset: e-mail a reset code if an account uses the address. Always 202 (the lookup
 * happens after the response); 503 while no mail provider is configured; 5 per hour per client IP.
 */
export const POST = defineRoute(
  { ...authExtraApi.requestPasswordReset, rateLimit: RESET_REQUEST_RULE },
  async ({ body }) => requestPasswordReset(body.email),
);
