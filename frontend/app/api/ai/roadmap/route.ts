import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { generateMajorRoadmap } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { major, completedCourses, classYear, interests } = await req.json();

    if (!major) {
      return NextResponse.json({ error: "major is required" }, { status: 400 });
    }

    const roadmap = await generateMajorRoadmap(
      major,
      completedCourses || [],
      classYear || "Freshman",
      interests || []
    );

    if (!roadmap) {
      return NextResponse.json({ error: "Failed to generate roadmap" }, { status: 500 });
    }

    return NextResponse.json({ roadmap });
  } catch (error) {
    console.error("POST /api/ai/roadmap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
