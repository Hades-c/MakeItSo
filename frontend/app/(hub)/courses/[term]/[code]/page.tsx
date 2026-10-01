import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { cache } from "react";
import { termLabel } from "@/lib/term";
import { requireUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { readEnv } from "@/server/env";
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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { term, code } = await params;
  const page = await resolvePage(term, code);
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
  const resolved = await resolvePage(term, code);
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
