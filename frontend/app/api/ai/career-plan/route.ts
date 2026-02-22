import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCareerPlan } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { career, major, classYear, completedCourses, regenerate } = await req.json();

    if (!career) {
      return NextResponse.json({ error: "career field is required" }, { status: 400 });
    }

    const userId = (session.user as { id?: string })?.id || session.user?.email || "";
    const cacheKey = JSON.stringify({
      userId,
      career,
      major: major || "Undecided",
      classYear: classYear || "Freshman",
      completedCourses: [...(completedCourses || [])].sort(),
    });

    await connectToDatabase();

    // Check cache unless regenerating
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "career-plan", cacheKey });
      if (cached) {
        return NextResponse.json({ plan: cached.data, cached: true, cachedAt: cached.updatedAt });
      }
    }

    const plan = await generateCareerPlan(
      career,
      major || "Undecided",
      classYear || "Freshman",
      completedCourses || []
    );

    if (!plan) {
      return NextResponse.json({ error: "Failed to generate career plan" }, { status: 500 });
    }

    // Save to cache
    await AiCache.findOneAndUpdate(
      { type: "career-plan", cacheKey },
      { data: plan },
      { upsert: true, new: true }
    );

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("POST /api/ai/career-plan error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
