import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateColdEmail } from "@/lib/gemini";

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
    } = await req.json();

    if (!alumniName || !alumniRole || !alumniCompany) {
      return NextResponse.json({ error: "Alumni details are required" }, { status: 400 });
    }

    const email = await generateColdEmail(
      alumniName,
      alumniRole,
      alumniCompany,
      alumniBio || "",
      alumniMajor || "",
      alumniClassYear || 2020,
      session.user?.name || "",
      studentMajor || "Undecided",
      studentClassYear || "Freshman",
      careerField || ""
    );

    if (!email) {
      return NextResponse.json({ error: "Failed to generate email" }, { status: 500 });
    }

    return NextResponse.json({ email });
  } catch (error) {
    console.error("POST /api/ai/cold-email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
