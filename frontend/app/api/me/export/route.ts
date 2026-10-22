import { NextResponse } from "next/server";
import { accountApi } from "@/lib/api/account";
import { exportAccount } from "@/server/auth";
import { EXPORT_RULE } from "@/server/auth/rate-limits";
import { defineRoute } from "@/server/http";

/**
 * GET /api/me/export (accountApi.export): everything MakeItSo stores about the signed-in student, as a JSON
 * download (5 per day). `profile` is the account without the password hash; `data` has one entry per collection
 * in the account data registry.
 */
export const GET = defineRoute(
  { ...accountApi.export, rateLimit: EXPORT_RULE },
  async ({ user }) => {
    const data = await exportAccount(user.id);
    const day = data.exportedAt.slice(0, 10);
    return NextResponse.json(data, {
      headers: { "Content-Disposition": `attachment; filename="makeitso-data-${day}.json"` },
    });
  },
);
