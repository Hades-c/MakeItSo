import Link from "next/link";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { CourseCode } from "@/components/ui/course-code";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import { currentTermFrom, type TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";
import type { Career } from "@/lib/types/content";
import { cn } from "@/lib/utils";
import { getSessionUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import {
  addToPlanTerms,
  courseLinkTerm,
  defaultAddTerm,
  unpublishedTermNote,
  type CareerTerms,
} from "../_lib/availability";
import { loadCareerTerms, loadCourseHistories } from "../_lib/catalog";
import {
  courseStanding,
  loadPlanPresence,
  plannedTerms,
  standingText,
  type PlanPresence,
  type StandingText,
} from "../_lib/plan";
import { CourseAddToPlan } from "./course-add-to-plan";

/**
 * The career's real Davidson courses with live availability per term (PLAN §3, §5 "Availability"): the current
 * term, the registration term (the default for Add to plan) and the next, unpublished one with "usually offered"
 * when the catalog supports it. Availability comes from getCourseHistory() on every request; when it cannot be
 * read, the course is listed without it (never a guess). A course the student has not taken has an Add to plan
 * control; one completed or under way says so in words instead (with a warning when it is also planned again),
 * and one marked completed, failed or withdrawn for a term that is not over says to check the plan, with a link.
 */

export interface CareerCourseView {
  code: string;
  title: string;
  why: string;
  /** Null when the catalog could not answer for this course. */
  terms: AddToPlanTerm[] | null;
  initialTerm: TermCode | null;
  inPlanTerms: string[];
  /**
   * The course's place in the plan in words ("Completed Fall 2025", "Taking now (Fall 2026)", a repeat or a result
   * marked too early with `warning`), or null when it is not taken yet. It shows instead of an Add control.
   */
  status: StandingText | null;
  /** "Fall 2027 isn’t published yet. Usually offered in Fall (based on …)", or null. */
  usually: string | null;
  /** The course page to link, or null when the course ran in no known term. */
  href: string | null;
}

/**
 * Pure: one course row from its history (null = unknown), the terms and the plan presence. `currentTerm` judges
 * the plan's statuses (the terms' current term by default; the page passes a date-based one when the terms cannot
 * be read, so a result marked too early is flagged even then).
 */
export function courseView(
  course: Career["courses"][number],
  history: readonly Availability[] | null,
  terms: CareerTerms | null,
  presence: PlanPresence | null,
  currentTerm: TermCode | null = terms?.current ?? null,
): CareerCourseView {
  const entries = presence?.get(course.code);
  const standing = courseStanding(entries, currentTerm);
  const base = {
    code: course.code,
    title: course.title,
    why: course.why,
    inPlanTerms: plannedTerms(entries),
    status: standing ? standingText(standing) : null,
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
        {view.status ? (
          <PlanStatusLine code={view.code} status={view.status} />
        ) : view.terms && currentTerm ? (
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

/**
 * Situation before catalog: a course already taken never offers "Add" without saying so. A warning (a repeat, or
 * a result marked for a term that is not over) is the warning icon and words in the warning colour (spec §5.6
 * `.st-warn`); the marked state's "check your plan" links the 4-year plan.
 */
function PlanStatusLine({ code, status }: { code: string; status: StandingText }) {
  const check = status.check && status.text.endsWith(status.check.words) ? status.check : null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-sm font-semibold",
        status.warning ? "text-warning" : "text-fg",
      )}
      data-testid="course-plan-status"
      data-source="my-plan"
      data-warning={status.warning ? "true" : undefined}
    >
      {status.warning ? <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> : null}
      <span>
        <span className="sr-only">Source: your plan. </span>
        {check ? (
          <>
            {status.text.slice(0, -check.words.length)}
            <Link
              href={check.href}
              // Inline in the sentence (WCAG 2.5.8's inline exception), like the page's other text links.
              className="text-primary underline underline-offset-2"
            >
              {check.words}
              <span className="sr-only">: {code} in your 4-year plan</span>
            </Link>
          </>
        ) : (
          status.text
        )}
      </span>
    </p>
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
  // Without the terms list, the date decides the current term (lib/term's own fallback).
  const current = terms?.current ?? currentTermFrom([], { now: now() });
  const views = career.courses.map((course) =>
    courseView(course, histories.get(course.code) ?? null, terms, presence, current),
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
