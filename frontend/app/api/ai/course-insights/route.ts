import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCourseInsights } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseCode, courseName, description, department } = await req.json();

    if (!courseCode || !courseName || !description || !department) {
      return NextResponse.json(
        { error: "courseCode, courseName, description, and department are required" },
        { status: 400 }
      );
    }

    const insights = await generateCourseInsights(
      courseCode,
      courseName,
      description,
      department
    );

    if (!insights) {
      return NextResponse.json(
        { error: "Failed to generate course insights" },
        { status: 500 }
      );
    }

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("POST /api/ai/course-insights error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
