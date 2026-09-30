import Link from "next/link";
import { CircleAlert } from "lucide-react";
import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { CourseCode } from "@/components/ui/course-code";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import type { TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";
import type { Career } from "@/lib/types/content";
import { getSessionUser } from "@/server/auth/session";
import {
  addToPlanTerms,
  courseLinkTerm,
  defaultAddTerm,
  unpublishedTermNote,
  type CareerTerms,
} from "../_lib/availability";
import { loadCareerTerms, loadCourseHistories } from "../_lib/catalog";
import { loadPlanPresence, type PlanPresence } from "../_lib/plan";
import { CourseAddToPlan } from "./course-add-to-plan";

/**
 * The career's real Davidson courses with live availability per term (PLAN §3, §5 "Availability"): the current
 * term, the registration term (the default for Add to plan) and the next, unpublished one with "usually offered"
 * when the catalog supports it. Availability comes from getCourseHistory() on every request; when it cannot be
 * read, the course is listed without it (never a guess). Each course has an Add to plan control.
 */

export interface CareerCourseView {
  code: string;
  title: string;
  why: string;
  /** Null when the catalog could not answer for this course. */
  terms: AddToPlanTerm[] | null;
  initialTerm: TermCode | null;
  inPlanTerms: string[];
  /** "Fall 2027 isn’t published yet. Usually offered in Fall (based on …)", or null. */
  usually: string | null;
  /** The course page to link, or null when the course ran in no known term. */
  href: string | null;
}

/** Pure: one course row from its history (null = unknown), the terms and the plan presence. */
export function courseView(
  course: Career["courses"][number],
  history: readonly Availability[] | null,
  terms: CareerTerms | null,
  presence: PlanPresence | null,
): CareerCourseView {
  const base = {
    code: course.code,
    title: course.title,
    why: course.why,
    inPlanTerms: [...(presence?.get(course.code) ?? [])],
  };
  if (!history || !terms) {
    return { ...base, terms: null, initialTerm: null, usually: null, href: null };
  }
  const choices = addToPlanTerms(history, terms);
  const next = history.find((entry) => entry.termCode === terms.next);
  const linkTerm = courseLinkTerm(history, terms);
  return {
    ...base,
    terms: choices.length > 0 ? choices : null,
    initialTerm: defaultAddTerm(choices, terms),
    usually: next ? unpublishedTermNote(next) : null,
    href: linkTerm ? routes.course(linkTerm, course.code) : null,
  };
}

export function CareerCourseItem({
  view,
  currentTerm,
  planHref,
  loginHref,
}: {
  view: CareerCourseView;
  currentTerm: TermCode | null;
  planHref: string;
  loginHref: string;
}) {
  const titleId = `course-${view.code.replace(/\s+/g, "-")}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex h-full min-w-0 flex-col lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:p-4"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CourseCode code={view.code} variant="chip" size="md" />
        <SourceTag source="course-schedule" />
      </div>
      <h3 id={titleId} className="mt-1 text-base font-strong tracking-title text-fg md:mt-2">
        {view.href ? (
          // 44px tall below 720px (PLAN §7 tap targets); one inline box inside, so the text wraps as before.
          <Link
            href={view.href}
            className="inline-flex min-h-11 items-center rounded-sm hover:underline md:inline md:min-h-0"
          >
            <span>
              {view.title} <span className="sr-only">({view.code})</span>
            </span>
          </Link>
        ) : (
          view.title
        )}
      </h3>
      <p className="mt-1 text-sm text-fg-2">{view.why}</p>
      <div className="mt-auto pt-3">
        {view.terms && currentTerm ? (
          <CourseAddToPlan
            courseCode={view.code}
            terms={view.terms}
            initialTerm={view.initialTerm}
            inPlanTerms={view.inPlanTerms}
            currentTerm={currentTerm}
            unpublishedNote={view.usually}
            planHref={planHref}
            loginHref={loginHref}
          />
        ) : (
          <p
            className="flex items-center gap-1.5 text-sm text-fg-2"
            data-testid="availability-unknown"
          >
            <CircleAlert aria-hidden className="size-4 shrink-0 text-taupe" />
            Schedule data for this course is unavailable right now.
          </p>
        )}
      </div>
    </article>
  );
}

export async function CareerCourses({ career }: { career: Career }) {
  const user = await getSessionUser();
  const [terms, histories, presence] = await Promise.all([
    loadCareerTerms(),
    loadCourseHistories(career.courses.map((course) => course.code)),
    user ? loadPlanPresence(user.id) : null,
  ]);
  const loginHref = routes.login(routes.career(career.slug));
  const views = career.courses.map((course) =>
    courseView(course, histories.get(course.code) ?? null, terms, presence),
  );
  const planHref = routes.plan("next");

  return (
    <SectionCard id="courses" title="Davidson courses" count={career.courses.length}>
      <p className="-mt-1.5 mb-4 text-sm text-fg-2">
        Real courses from the Davidson schedule, with where they run. Adding one puts it in My plan
        for the term you choose.
      </p>
      <ul
        className="grid divide-y divide-line lg:grid-cols-2 lg:gap-3 lg:divide-y-0"
        data-testid="career-courses"
      >
        {views.map((view) => (
          <li
            key={view.code}
            className="min-w-0 py-4 first:pt-0 last:pb-0 lg:py-0"
            data-aggregated="course-schedule"
            data-source="course-schedule"
            data-course={view.code}
          >
            <CareerCourseItem
              view={view}
              currentTerm={terms?.current ?? null}
              planHref={planHref}
              loginHref={loginHref}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
