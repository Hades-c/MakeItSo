import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateMajorRoadmap } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { major, completedCourses, classYear, interests, specificity } = await req.json();

    if (!major) {
      return NextResponse.json({ error: "major is required" }, { status: 400 });
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

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ai/roadmap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
