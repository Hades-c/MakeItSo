import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "@/models/User";
import { getDb } from "@/server/db";
import { ApiError, defineRoute, isDuplicateKeyError } from "@/server/http";

// Wave-0 behaviour, unchanged. W3 moves this route to accountApi.register in lib/api/account.ts (the
// @davidson.edu rule, NFKC normalisation, the 10–72 byte password policy, rate limiting and the always-202
// "Check your Davidson inbox" answer).
const RegisterInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
    major: z.string().trim().min(1).max(100).optional(),
    graduationYear: z.number().int().min(2000).max(2100).optional(),
    currentYear: z.enum(["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]).optional(),
  })
  .strip();

const DUPLICATE_MESSAGE = "An account with that email already exists";

export const POST = defineRoute(
  {
    method: "POST",
    path: "/api/auth/register",
    auth: "public",
    body: RegisterInput,
    response: z.object({ message: z.string(), userId: z.string() }),
    status: 201,
  },
  async ({ body: input }) => {
    await getDb();

    const existing = await User.exists({ email: input.email });
    if (existing) throw new ApiError(409, "conflict", DUPLICATE_MESSAGE);

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
      if (isDuplicateKeyError(error)) throw new ApiError(409, "conflict", DUPLICATE_MESSAGE);
      throw error;
    }

    // No course plan is created here: new code never writes the legacy `courseplans` collection (PLAN §4), and
    // the v2 plan is created on the student's first plan change.
    return { message: "Account created successfully", userId };
  },
);
