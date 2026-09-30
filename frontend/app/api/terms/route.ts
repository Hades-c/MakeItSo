import { NextResponse } from "next/server";
import { getTerms } from "@/lib/davidson-api";

export const dynamic = "force-dynamic";

// GET /api/terms - the active term and the registration term (first non-summer
// term after the active one), resolved from the Davidson terms API.
export async function GET() {
  const terms = await getTerms();
  return NextResponse.json(
    { ...terms, today: new Date().toISOString().slice(0, 10) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
  );
}
