import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { generateCareerPlan } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { career, major, classYear } = await req.json();

    if (!career) {
      return NextResponse.json({ error: "career field is required" }, { status: 400 });
    }

    const plan = await generateCareerPlan(
      career,
      major || "Undecided",
      classYear || "Freshman"
    );

    if (!plan) {
      return NextResponse.json({ error: "Failed to generate career plan" }, { status: 500 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("POST /api/ai/career-plan error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
