import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import CoursePlan from "@/models/CoursePlan";
import User from "@/models/User";
import { getDb } from "@/server/db";
import { ApiError, parseJsonBody, withApi } from "@/server/http";

// Basic validation only; wave 1 (auth-security-profile) adds the @davidson.edu rule, NFKC normalisation,
// the stronger password policy and rate limiting.
const RegisterInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  major: z.string().trim().min(1).max(100).optional(),
  graduationYear: z.number().int().min(2000).max(2100).optional(),
  currentYear: z.enum(["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]).optional(),
});

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export const POST = withApi(async (req: Request) => {
  const input = await parseJsonBody(req, RegisterInput);

  await getDb();

  const existing = await User.exists({ email: input.email });
  if (existing) {
    throw new ApiError(409, "conflict", "An account with that email already exists");
  }

  const hashedPassword = await bcrypt.hash(input.password, 12);

  let userId: string;
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      password: hashedPassword,
      major: input.major ?? "Undecided",
      graduationYear: input.graduationYear ?? new Date().getFullYear() + 4,
      currentYear: input.currentYear ?? "Freshman",
    });
    userId = user._id.toString();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ApiError(409, "conflict", "An account with that email already exists");
    }
    throw error;
  }

  // Every account starts with an empty course plan.
  await CoursePlan.create({ userId, plannedCourses: [] });

  return NextResponse.json({ message: "Account created successfully", userId }, { status: 201 });
});
