import { profileApi } from "@/lib/api/profile";
import { getProfile, updateProfile } from "@/server/auth";
import { defineRoute } from "@/server/http";

/** GET /api/profile (profileApi.get): the Profile (plus the derived `standing`). */
export const GET = defineRoute(profileApi.get, async ({ user }) => ({
  profile: await getProfile(user.id),
}));

/**
 * PATCH /api/profile (profileApi.update): the strict whitelist in lib/api/profile.ts; null clears firstTerm and
 * standingOverride; majors/minors must be official names (server/auth/profile.ts has every rule).
 */
export const PATCH = defineRoute(profileApi.update, async ({ user, body }) => ({
  profile: await updateProfile(user.id, body),
}));
