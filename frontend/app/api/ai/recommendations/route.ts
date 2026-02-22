import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCourseRecommendations } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { interests, completedCourses, major, classYear, regenerate } = await req.json();

    if (!interests || interests.length === 0) {
      return NextResponse.json({ error: "At least one interest is required" }, { status: 400 });
    }

    const userId = (session.user as { id?: string })?.id || session.user?.email || "";
    const cacheKey = JSON.stringify({
      userId,
      interests: [...interests].sort(),
      major: major || "Undecided",
      classYear: classYear || "Freshman",
      completedCourses: [...(completedCourses || [])].sort(),
    });

    await connectToDatabase();

    // Check cache unless regenerating
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "recommendations", cacheKey });
      if (cached) {
        return NextResponse.json({ recommendations: cached.data, cached: true, cachedAt: cached.updatedAt });
      }
    }

    const recommendations = await generateCourseRecommendations(
      interests,
      completedCourses || [],
      major || "Undecided",
      classYear || "Freshman"
    );

    if (!recommendations) {
      return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
    }

    // Save to cache
    await AiCache.findOneAndUpdate(
      { type: "recommendations", cacheKey },
      { data: recommendations },
      { upsert: true, new: true }
    );

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("POST /api/ai/recommendations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
