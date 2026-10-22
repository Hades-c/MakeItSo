import { accountApi } from "@/lib/api/account";
import { resendVerification } from "@/server/auth";
import { defineRoute } from "@/server/http";

/**
 * POST /api/account/verify/resend (accountApi.resendVerification): e-mail a new code (3 per hour per account,
 * the registration e-mail included). 202 `{ sent }`; 503 while no mail provider is configured.
 */
export const POST = defineRoute(accountApi.resendVerification, async ({ user }) =>
  resendVerification(user.id),
);
