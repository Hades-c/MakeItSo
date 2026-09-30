import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCourseRecommendations } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";
import { getAiGrounding, groundRecommendations, termKey, type AiGrounding } from "@/lib/ai-grounding";

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

    // Recommendations are only shown if they are on the live schedule, so the
    // live catalog is required.
    let grounding: AiGrounding;
    try {
      grounding = await getAiGrounding();
    } catch {
      return NextResponse.json(
        { error: "The Davidson course schedule is unavailable right now, so AI recommendations are paused." },
        { status: 503 }
      );
    }

    const userId = (session.user as { id?: string })?.id || session.user?.email || "";
    const cacheKey = JSON.stringify({
      v: 2,
      terms: termKey(grounding.context),
      userId,
      interests: [...interests].sort(),
      major: major || "Undecided",
      classYear: classYear || "Freshman",
      completedCourses: [...(completedCourses || [])].sort(),
    });

    await connectToDatabase();

    // Check cache unless regenerating (per-user cache entry)
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "recommendations", cacheKey });
      if (cached) {
        return NextResponse.json({
          recommendations: groundRecommendations(cached.data, grounding.index),
          cached: true,
          cachedAt: cached.updatedAt,
        });
      }
    }

    const raw = await generateCourseRecommendations(
      interests,
      completedCourses || [],
      major || "Undecided",
      classYear || "Freshman",
      grounding.context
    );

    if (!raw) {
      return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
    }

    // Drop any course that is not on the active or registration schedule
    // before it is cached or shown.
    const recommendations = groundRecommendations(raw, grounding.index);

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
