import { accountApi } from "@/lib/api/account";
import { changePassword } from "@/server/auth";
import { PASSWORD_CHANGE_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * POST /api/account/password (accountApi.changePassword): current password + new password → 204. Bumps the
 * session version, so every session (this one too) ends; the form signs in again with the new password.
 */
export const POST = defineRoute(
  { ...accountApi.changePassword, rateLimit: PASSWORD_CHANGE_RULE },
  async ({ user, body }) => {
    await changePassword(user.id, body.currentPassword, body.newPassword);
    return null;
  },
);
