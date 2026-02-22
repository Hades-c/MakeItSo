import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateColdEmail } from "@/lib/gemini";
import { connectToDatabase } from "@/lib/mongodb";
import AiCache from "@/models/AiCache";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      alumniName,
      alumniRole,
      alumniCompany,
      alumniBio,
      alumniMajor,
      alumniClassYear,
      careerField,
      studentMajor,
      studentClassYear,
      regenerate,
    } = await req.json();

    if (!alumniName || !alumniRole || !alumniCompany) {
      return NextResponse.json({ error: "Alumni details are required" }, { status: 400 });
    }

    const studentName = session.user?.name || "";
    const cacheKey = JSON.stringify({
      alumniName: alumniName.toLowerCase(),
      alumniRole,
      alumniCompany,
      studentName: studentName.toLowerCase(),
      careerField: careerField || "",
    });

    await connectToDatabase();

    // Check cache unless regenerating
    if (!regenerate) {
      const cached = await AiCache.findOne({ type: "cold-email", cacheKey });
      if (cached) {
        return NextResponse.json({ email: cached.data, cached: true, cachedAt: cached.updatedAt });
      }
    }

    const email = await generateColdEmail(
      alumniName,
      alumniRole,
      alumniCompany,
      alumniBio || "",
      alumniMajor || "",
      alumniClassYear || 2020,
      studentName,
      studentMajor || "Undecided",
      studentClassYear || "Freshman",
      careerField || ""
    );

    if (!email) {
      return NextResponse.json({ error: "Failed to generate email" }, { status: 500 });
    }

    // Save to cache
    await AiCache.findOneAndUpdate(
      { type: "cold-email", cacheKey },
      { data: email },
      { upsert: true, new: true }
    );

    return NextResponse.json({ email });
  } catch (error) {
    console.error("POST /api/ai/cold-email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
