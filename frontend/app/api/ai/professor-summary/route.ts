import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateProfessorSummary } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";
import { PROFESSOR_RATINGS_ENABLED } from "@/lib/features";

export async function POST(req: NextRequest) {
  // Hidden until professors can be matched correctly (see lib/features.ts).
  // Before re-enabling: build the prompt only from server-fetched data and
  // require the professor to teach the live course.
  if (!PROFESSOR_RATINGS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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

    if (typeof professorName !== "string" || typeof courseCode !== "string" || !professorName || !courseCode) {
      return NextResponse.json(
        { error: "professorName and courseCode are required" },
        { status: 400 }
      );
    }

    // v2: entries written before the registration hotfix are never served.
    const cacheKey = JSON.stringify({ v: 2, professorName: professorName.toLowerCase(), courseCode: courseCode.toUpperCase() });

    await connectToDatabase();

    // Summaries are shared by every student, so a cached entry is always
    // served; "regenerate" requests are ignored (no user can overwrite it).
    const cached = await AiCache.findOne({ type: "professor-summary", cacheKey });
    if (cached) {
      return NextResponse.json({ summary: cached.data, cached: true, cachedAt: cached.updatedAt });
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

    // Save to cache
    await AiCache.updateOne(
      { type: "professor-summary", cacheKey },
      { $setOnInsert: { data: summary } },
      { upsert: true }
    ).catch((err: { code?: number }) => {
      if (err?.code !== 11000) throw err; // a concurrent request inserted it first
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("POST /api/ai/professor-summary error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
