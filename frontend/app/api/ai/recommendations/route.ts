import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { generateCourseRecommendations } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { interests, completedCourses, major, classYear } = await req.json();

    if (!interests || interests.length === 0) {
      return NextResponse.json({ error: "At least one interest is required" }, { status: 400 });
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

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("POST /api/ai/recommendations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
