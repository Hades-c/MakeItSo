import type { Metadata } from "next";
import { notFound, permanentRedirect, unstable_rethrow } from "next/navigation";
import { routes } from "@/lib/routes";
import { cache } from "react";
import { termLabel } from "@/lib/term";
import { requireUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { readEnv } from "@/server/env";
import { ApiError } from "@/server/http/errors";
import {
  canonicalSlugDiffers,
  loadCoursePage,
  parseCourseParams,
  resolveCoursePage,
} from "../../_lib/course";
import { loadStudentPlan } from "../../_lib/student";
import { CourseView } from "../../_components/course-view";

type Params = Promise<{ term: string; code: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * /courses/[term]/[code] (PLAN §3): one course in one term. A malformed term or code, a code the schedule never
 * had, or a term the catalog does not know answers a real 404 (notFound() before anything renders; there is no
 * loading.tsx on this route on purpose, it would start streaming first). A course that runs in other terms but
 * not this one is a page that says so, with its other terms. `?crn=` picks the section the header and the week
 * grid show (URL state, PLAN §7).
 */

const resolvePage = cache(async (term: string, code: string) => {
  const params = parseCourseParams(term, code);
  if (!params) return null;
  return resolveCoursePage(params);
});

/** The schedule cannot be read right now (a 503 from the catalog: never ingested and the upstream is down). */
function isUnavailable(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 503;
}

/** resolvePage, or "unavailable" while the schedule cannot be read (the page then says so with a 200). */
async function resolveOrUnavailable(term: string, code: string) {
  try {
    return await resolvePage(term, code);
  } catch (error) {
    unstable_rethrow(error);
    if (isUnavailable(error)) return "unavailable" as const;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { term, code } = await params;
  const page = await resolveOrUnavailable(term, code);
  if (page === "unavailable") return { title: "Course" };
  if (!page) notFound();
  return {
    title: `${page.params.code} · ${termLabel(page.params.term)}`,
    description: page.reference.title,
    alternates: { canonical: routes.course(page.params.term, page.params.code) },
  };
}

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first && /^\d{4,6}$/.test(first) ? first : null;
}

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { term, code } = await params;
  const resolved = await resolveOrUnavailable(term, code);
  if (resolved === "unavailable") {
    return (
      <>
        <PageHeader title="Course" />
        <ErrorState
          title="This course could not load"
          description="The course schedule is temporarily unavailable. Try again in a few minutes."
        />
      </>
    );
  }
  if (!resolved) notFound();
  const crn = firstParam((await searchParams).crn);
  // One URL per course page: /courses/202602/csc%20221, /CSC221 and /csc-221 redirect to /CSC-221.
  const canonical = routes.course(resolved.params.term, resolved.params.code);
  if (canonicalSlugDiffers(term, code, canonical)) {
    permanentRedirect(crn ? `${canonical}?crn=${crn}` : canonical);
  }
  const plan = await loadStudentPlan(user.id, now());
  const data = await loadCoursePage(resolved, { userId: user.id, requestedCrn: crn, plan });
  return <CourseView data={data} timeZone={readEnv("APP_TIMEZONE")} />;
}
