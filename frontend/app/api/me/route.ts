import { accountApi } from "@/lib/api/account";
import { deleteAccount, getMe, signedOutResponse } from "@/server/auth";
import { DELETE_ACCOUNT_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/** GET /api/me (accountApi.me): who is signed in, whether they are a verified Davidson account, onboarding. */
export const GET = defineRoute(accountApi.me, async ({ user }) => getMe(user.id));

/**
 * DELETE /api/me (accountApi.delete): password re-entry, then every eraser in the account data registry and the
 * account itself → 204 with the session cookie cleared.
 */
export const DELETE = defineRoute(
  { ...accountApi.delete, rateLimit: DELETE_ACCOUNT_RULE },
  async ({ user, body }) => {
    await deleteAccount(user.id, body.password);
    return signedOutResponse();
  },
);
