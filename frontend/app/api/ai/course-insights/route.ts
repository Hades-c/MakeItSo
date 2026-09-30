import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCourseInsights } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";
import { findLiveCourse, normalizeCourseCode } from "@/lib/davidson-api";

// Course insights are cached once per course and shown to every student, so:
// - the prompt is built only from the server's copy of the live catalog
//   (client-supplied names/descriptions are ignored), and
// - students cannot regenerate (overwrite) a cached entry.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const courseCode = typeof body.courseCode === "string" ? normalizeCourseCode(body.courseCode) : "";
    const termCode = typeof body.termCode === "string" ? body.termCode : undefined;

    if (!courseCode) {
      return NextResponse.json({ error: "courseCode is required" }, { status: 400 });
    }

    const course = await findLiveCourse(courseCode, termCode).catch(() => null);
    if (!course) {
      return NextResponse.json(
        { error: `${courseCode} is not on the current or registration-term schedule.` },
        { status: 404 }
      );
    }
    if (!course.description) {
      return NextResponse.json(
        { error: "No official description is published for this course yet, so there is nothing to analyze." },
        { status: 404 }
      );
    }

    // v2: entries written before this fix could contain client-supplied text.
    const cacheKey = JSON.stringify({ v: 2, courseCode: course.code });

    await connectToDatabase();

    const cached = await AiCache.findOne({ type: "course-insights", cacheKey });
    if (cached) {
      return NextResponse.json({ insights: cached.data, cached: true, cachedAt: cached.updatedAt });
    }

    const description = course.prerequisites
      ? `${course.description} Prerequisites: ${course.prerequisites}`
      : course.description;
    const insights = await generateCourseInsights(course.code, course.name, description, course.department);

    if (!insights) {
      return NextResponse.json(
        { error: "Failed to generate course insights" },
        { status: 500 }
      );
    }

    // Insert only; never overwrite an existing shared entry.
    await AiCache.updateOne(
      { type: "course-insights", cacheKey },
      { $setOnInsert: { data: insights } },
      { upsert: true }
    ).catch((err: { code?: number }) => {
      if (err?.code !== 11000) throw err; // a concurrent request inserted it first
    });

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("POST /api/ai/course-insights error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
