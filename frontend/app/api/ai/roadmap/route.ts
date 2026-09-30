import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateMajorRoadmap } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";
import { getAiGrounding, groundRoadmap, termKey, type AiGrounding } from "@/lib/ai-grounding";

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

    let grounding: AiGrounding;
    try {
      grounding = await getAiGrounding();
    } catch {
      return NextResponse.json(
        { error: "The Davidson course schedule is unavailable right now, so roadmap generation is paused." },
        { status: 503 }
      );
    }

    const userId = (session.user as { id?: string })?.id || session.user?.email || "";
    const cacheKey = JSON.stringify({
      v: 2,
      terms: termKey(grounding.context),
      userId,
      major,
      classYear: classYear || "Freshman",
      interests: [...(interests || [])].sort(),
      specificity: specificity ?? 3,
      completedCourses: [...(completedCourses || [])].sort(),
    });

    await connectToDatabase();

    // Check cache unless regenerating (per-user cache entry)
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "roadmap", cacheKey });
      const grounded = cached ? groundRoadmap(cached.data, grounding.index, grounding.context.registration) : null;
      // A cached plan with no semester from the registration term on is regenerated.
      if (cached && grounded && grounded.roadmap.some((s) => !s.isSummer)) {
        return NextResponse.json({ ...grounded, cached: true, cachedAt: cached.updatedAt });
      }
    }

    const raw = await generateMajorRoadmap(
      major,
      completedCourses || [],
      classYear || "Freshman",
      interests || [],
      specificity ?? 3,
      grounding.context
    );

    if (!raw) {
      return NextResponse.json({ error: "Failed to generate roadmap" }, { status: 500 });
    }

    // Drop semesters before the registration term and course codes that are
    // not on the live schedule (generic "ELEC ---" style slots are kept as
    // placeholders) before caching.
    const result = groundRoadmap(raw, grounding.index, grounding.context.registration);
    if (!result.roadmap.some((s) => !s.isSummer)) {
      // Nothing usable from the registration term on: don't cache it.
      return NextResponse.json(
        {
          error: `The AI plan did not start at ${grounding.context.registration.label}. Please try again.`,
        },
        { status: 502 }
      );
    }

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
