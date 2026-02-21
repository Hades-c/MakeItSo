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

    // Fetch real reviews from RateMyProfessors
    let reviewTexts: string[] = [];
    try {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const rmpRes = await fetch(`${baseUrl}/api/rmp/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.get("cookie") || "",
        },
        body: JSON.stringify({ professorName }),
      });
      if (rmpRes.ok) {
        const rmpData = await rmpRes.json();
        if (rmpData.found && rmpData.reviews) {
          reviewTexts = rmpData.reviews
            .filter((r: { comment: string }) => r.comment && r.comment.trim())
            .map(
              (r: {
                comment: string;
                class: string;
                grade: string;
                clarityRating: number;
                difficultyRating: number;
              }) => {
                const parts = [r.comment];
                if (r.class) parts.push(`(Course: ${r.class})`);
                if (r.grade) parts.push(`(Grade: ${r.grade})`);
                return parts.join(" ");
              }
            )
            .slice(0, 15); // Cap at 15 reviews for context window
        }
      }
    } catch (err) {
      console.error("Failed to fetch RMP reviews:", err);
      // Continue without reviews - will use static data only
    }

    const summary = await generateProfessorSummary(
      professorName,
      courseCode,
      courseName || "",
      rmpRating,
      rmpDifficulty,
      rmpNumRatings,
      rmpWouldTakeAgain,
      rmpTags,
      reviewTexts
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
