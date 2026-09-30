import { NextResponse } from "next/server";
import { z } from "zod";
import User from "@/models/User";
import { requireApiUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { ApiError, parseJsonBody, withApi } from "@/server/http";

// GET /api/profile — the signed-in user's profile.
export const GET = withApi(async () => {
  const { id } = await requireApiUser();
  await getDb();

  const user = await User.findById(id).lean();
  if (!user) throw new ApiError(404, "not_found", "User not found");

  return NextResponse.json({ user });
});

// Only these fields may be changed through this route (no mass assignment: audit
// security/profile-patch-mass-assignment-proto-pollution). Wave 1 replaces this with the full profile schema.
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
export const PATCH = withApi(async (req: Request) => {
  const { id } = await requireApiUser();
  const updates = await parseJsonBody(req, ProfilePatch);
  await getDb();

  const user = await User.findByIdAndUpdate(
    id,
    { $set: updates },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!user) throw new ApiError(404, "not_found", "User not found");

  return NextResponse.json({ user });
});
