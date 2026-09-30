import { accountApi } from "@/lib/api/account";
import { verifyEmailCode } from "@/server/auth";
import { VERIFY_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * POST /api/account/verify (accountApi.verify): the 6-digit code for the signed-in account's mailbox. 400 with a
 * `code` issue for a wrong or expired code (attempts left in the message), 429 after 5 wrong attempts.
 */
export const POST = defineRoute(
  { ...accountApi.verify, rateLimit: VERIFY_RULE },
  async ({ user, body }) => verifyEmailCode(user.id, body.code),
);
