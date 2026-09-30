import { z } from "zod";
import User from "@/models/User";
import { getDb } from "@/server/db";
import { ApiError, defineRoute } from "@/server/http";

// Wave-0 behaviour, unchanged: `{ user }` with the stored document. W3 moves this route to profileApi in
// lib/api/profile.ts (the Profile shape and the full whitelist, null → $unset).

// GET /api/profile — the signed-in user's profile.
export const GET = defineRoute(
  { method: "GET", path: "/api/profile", auth: "user" },
  async ({ user: { id } }) => {
    await getDb();
    const user = await User.findById(id).lean();
    if (!user) throw new ApiError(404, "not_found", "User not found");
    return { user };
  },
);

// Only these fields may be changed through this route (no mass assignment: audit
// security/profile-patch-mass-assignment-proto-pollution).
const ProfilePatch = z
  .object({
    name: z.string().trim().min(1).max(100),
    major: z.string().trim().min(1).max(100),
    minor: z.string().trim().max(100),
    graduationYear: z.number().int().min(2000).max(2100),
    currentYear: z.enum(["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]),
    bio: z.string().max(500),
    careerInterests: z.array(z.string().trim().min(1).max(100)).max(50),
  })
  .partial()
  .strict();

// PATCH /api/profile — update whitelisted profile fields.
export const PATCH = defineRoute(
  { method: "PATCH", path: "/api/profile", auth: "user", body: ProfilePatch },
  async ({ user: { id }, body: updates }) => {
    await getDb();
    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!user) throw new ApiError(404, "not_found", "User not found");
    return { user };
  },
);
