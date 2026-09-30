import { NextRequest, NextResponse } from "next/server";
import { CourseDataUnavailableError, getTermCourses, getTerms } from "@/lib/davidson-api";

export const dynamic = "force-dynamic";

// GET /api/courses/davidson[?term=202601|202602]
// Live course schedule from the Davidson College public API. Defaults to the
// registration term (first non-summer term after the active one). Only the
// active term and the registration term may be requested.
export async function GET(req: NextRequest) {
  const terms = await getTerms();
  const requested = req.nextUrl.searchParams.get("term");
  const allowed = [terms.registration, terms.active];
  const term = requested ? allowed.find((t) => t.code === requested) : terms.registration;

  if (!term) {
    return NextResponse.json(
      {
        error: `Unsupported term. Use ${terms.active.code} (${terms.active.label}) or ${terms.registration.code} (${terms.registration.label}).`,
        terms: { active: terms.active, registration: terms.registration },
      },
      { status: 400 }
    );
  }

  try {
    const { data, stale } = await getTermCourses(term);
    return NextResponse.json(
      {
        courses: data.courses,
        total: data.courses.length,
        sectionCount: data.sectionCount,
        term: data.term.label,
        termCode: data.term.code,
        terms: { active: terms.active, registration: terms.registration, source: terms.source },
        fetchedAt: data.fetchedAt,
        stale,
      },
      {
        headers: {
          // Public schedule data; let the CDN absorb registration-day traffic.
          "Cache-Control": stale
            ? "public, s-maxage=60, stale-while-revalidate=300"
            : "public, s-maxage=300, stale-while-revalidate=900",
        },
      }
    );
  } catch (error) {
    if (!(error instanceof CourseDataUnavailableError)) {
      console.error("GET /api/courses/davidson error:", error);
    }
    return NextResponse.json(
      {
        error: `Course data for ${term.label} is temporarily unavailable. Please try again in a minute.`,
        term: term.label,
        termCode: term.code,
        terms: { active: terms.active, registration: terms.registration, source: terms.source },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
