import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCareerPlan } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";
import { getAiGrounding, groundCareerPlan, termKey, type AiGrounding } from "@/lib/ai-grounding";

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

    let grounding: AiGrounding;
    try {
      grounding = await getAiGrounding();
    } catch {
      return NextResponse.json(
        { error: "The Davidson course schedule is unavailable right now, so the AI roadmap is paused." },
        { status: 503 }
      );
    }

    const userId = (session.user as { id?: string })?.id || session.user?.email || "";
    const cacheKey = JSON.stringify({
      v: 2,
      terms: termKey(grounding.context),
      userId,
      career,
      major: major || "Undecided",
      classYear: classYear || "Freshman",
      completedCourses: [...(completedCourses || [])].sort(),
    });

    await connectToDatabase();

    // Check cache unless regenerating (per-user cache entry)
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "career-plan", cacheKey });
      if (cached) {
        return NextResponse.json({
          plan: groundCareerPlan(cached.data, grounding.index),
          cached: true,
          cachedAt: cached.updatedAt,
        });
      }
    }

    const raw = await generateCareerPlan(
      career,
      major || "Undecided",
      classYear || "Freshman",
      completedCourses || [],
      grounding.context
    );

    if (!raw) {
      return NextResponse.json({ error: "Failed to generate career plan" }, { status: 500 });
    }

    // Drop recommended courses that are not on the live schedule before caching.
    const plan = groundCareerPlan(raw, grounding.index);

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
