import { accountApi } from "@/lib/api/account";
import { signedOutResponse, signOutEverywhere } from "@/server/auth";
import { defineRoute } from "@/server/http";

/** DELETE /api/account/sessions (accountApi.signOutEverywhere): revoke every session → 204, cookie cleared. */
export const DELETE = defineRoute(accountApi.signOutEverywhere, async ({ user }) => {
  await signOutEverywhere(user.id);
  return signedOutResponse();
});
