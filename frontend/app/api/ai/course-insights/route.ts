import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCourseInsights } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseCode, courseName, description, department, extraContext, regenerate } = await req.json();

    if (!courseCode || !courseName || !description || !department) {
      return NextResponse.json(
        { error: "courseCode, courseName, description, and department are required" },
        { status: 400 }
      );
    }

    const cacheKey = JSON.stringify({ courseCode: courseCode.toUpperCase() });

    await connectToDatabase();

    // Check cache unless regenerating
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "course-insights", cacheKey });
      if (cached) {
        return NextResponse.json({ insights: cached.data, cached: true, cachedAt: cached.updatedAt });
      }
    }

    const insights = await generateCourseInsights(
      courseCode,
      courseName,
      description,
      department,
      extraContext
    );

    if (!insights) {
      return NextResponse.json(
        { error: "Failed to generate course insights" },
        { status: 500 }
      );
    }

    // Save to cache
    await AiCache.findOneAndUpdate(
      { type: "course-insights", cacheKey },
      { data: insights },
      { upsert: true, new: true }
    );

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("POST /api/ai/course-insights error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
