import { accountApi } from "@/lib/api/account";
import { confirmPasswordResetLink } from "@/server/auth";
import { RESET_CONFIRM_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * POST /api/auth/password-reset/link: the e-mailed link's token + new password → 200 { email }. A link that does
 * not open a live reset is a 400 on `token`; shares the code confirmation's 10 per 15 minutes per client IP.
 */
export const POST = defineRoute(
  { ...accountApi.confirmPasswordResetLink, rateLimit: RESET_CONFIRM_RULE },
  async ({ body }) => confirmPasswordResetLink(body.token, body.newPassword),
);
