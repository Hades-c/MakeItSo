import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateMajorRoadmap } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { major, completedCourses, classYear, interests, specificity, regenerate } = await req.json();

    if (!major) {
      return NextResponse.json({ error: "major is required" }, { status: 400 });
    }

    const userId = (session.user as { id?: string })?.id || session.user?.email || "";
    const cacheKey = JSON.stringify({
      userId,
      major,
      classYear: classYear || "Freshman",
      interests: [...(interests || [])].sort(),
      specificity: specificity ?? 3,
      completedCourses: [...(completedCourses || [])].sort(),
    });

    await connectToDatabase();

    // Check cache unless regenerating
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "roadmap", cacheKey });
      if (cached) {
        return NextResponse.json({ ...cached.data as Record<string, unknown>, cached: true, cachedAt: cached.updatedAt });
      }
    }

    const result = await generateMajorRoadmap(
      major,
      completedCourses || [],
      classYear || "Freshman",
      interests || [],
      specificity ?? 3
    );

    if (!result) {
      return NextResponse.json({ error: "Failed to generate roadmap" }, { status: 500 });
    }

    // Save to cache
    await AiCache.findOneAndUpdate(
      { type: "roadmap", cacheKey },
      { data: result },
      { upsert: true, new: true }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ai/roadmap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
