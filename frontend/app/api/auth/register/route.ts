import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import CoursePlan from "@/models/CoursePlan";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "@/lib/email";

// New sign-ups are limited to Davidson College addresses. Existing accounts
// on other domains can still sign in (see lib/auth.ts), so this check lives
// only here.
const DAVIDSON_EMAIL = /^[a-z0-9._%+-]+@davidson\.edu$/;

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { major, graduationYear, currentYear } = body;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const davidsonOnly = () =>
      NextResponse.json(
        { error: "Sign-up is limited to Davidson College students. Use your @davidson.edu email." },
        { status: 400 }
      );
    if (body.email != null && typeof body.email !== "string") return davidsonOnly();
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }

    if (!DAVIDSON_EMAIL.test(email)) return davidsonOnly();

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    await connectToDatabase();

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      major: major ?? "Undecided",
      graduationYear: graduationYear ?? new Date().getFullYear() + 4,
      currentYear: currentYear ?? "Freshman",
    });

    // Create an empty course plan for the user
    await CoursePlan.create({ userId: user._id, plannedCourses: [] });

    return NextResponse.json(
      { message: "Account created successfully", userId: user._id.toString(), email },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
