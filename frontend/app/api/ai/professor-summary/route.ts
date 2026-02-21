import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateProfessorSummary } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      professorName,
      courseCode,
      courseName,
      rmpRating,
      rmpDifficulty,
      rmpNumRatings,
      rmpWouldTakeAgain,
      rmpTags,
    } = await req.json();

    if (!professorName || !courseCode) {
      return NextResponse.json(
        { error: "professorName and courseCode are required" },
        { status: 400 }
      );
    }

    const summary = await generateProfessorSummary(
      professorName,
      courseCode,
      courseName || "",
      rmpRating,
      rmpDifficulty,
      rmpNumRatings,
      rmpWouldTakeAgain,
      rmpTags
    );

    if (!summary) {
      return NextResponse.json(
        { error: "Failed to generate professor summary" },
        { status: 500 }
      );
    }

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("POST /api/ai/professor-summary error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
