import Link from "next/link";
import { SourceTag } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import { termLabel } from "@/lib/term";
import { REQUIREMENTS_DISCLAIMER, requirementName } from "@/server/content/requirements";
import type { CoursePageData } from "../_lib/course";
import { AddCourse } from "./add-course";
import { CourseAboutPanel } from "./course-about-panel";
import { CourseAboutCard, CourseHeader, CourseWeekCard, OtherTermsCard } from "./course-cards";
import { CourseSections } from "./course-sections";

/**
 * The course page's body (app/(hub)/courses/[term]/[code]/page.tsx resolves the data and the 404s first):
 * breadcrumb, the index-card header, About + Add to plan, then Sections, the AI About panel and Other terms beside
 * the week grid. Mobile stacks them in that order.
 */

const CRUMB =
  "inline-flex min-h-11 items-center rounded-sm font-semibold text-primary hover:underline md:min-h-0";

export function CourseView({ data, timeZone }: { data: CoursePageData; timeZone?: string }) {
  const { params, course, reference, chosen, add } = data;
  const subject = reference.sections[0]?.subject ?? params.code.split(" ")[0]!;
  const pageHref = routes.course(params.term, params.code);
  const asOf = course ? data.asOf : null;
  const requirements = reference.reqCodes.map((req) => ({ code: req, name: requirementName(req) }));

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 md:mb-2">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-3">
          <li>
            <Link href={routes.courses()} className={CRUMB}>
              Courses
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={routes.courses({ term: params.term })} className={CRUMB}>
              {termLabel(params.term)}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={routes.courses({ term: params.term, dept: [subject] })} className={CRUMB}>
              {data.departmentName ?? subject}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="font-mono text-xs text-fg-2">
            {chosen ? `${params.code} ${chosen.section}` : params.code}
          </li>
        </ol>
      </nav>

      <CourseHeader
        course={course ?? reference}
        term={params.term}
        chosen={chosen}
        departmentName={data.departmentName}
        asOf={asOf}
        offered={course !== null}
      />

      <div className="flex flex-col gap-5">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <CourseAboutCard
            course={reference}
            requirements={requirements}
            programs={data.programs}
            disclaimer={REQUIREMENTS_DISCLAIMER}
            asOf={asOf}
          />
          <section
            id="add-to-plan"
            aria-labelledby="add-title"
            className="min-w-0 scroll-mt-24 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5"
          >
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <h2 id="add-title" className="text-lg font-strong tracking-title text-fg">
                Add to plan
              </h2>
              <SourceTag source="course-schedule" />
            </div>
            {add.terms.length > 0 ? (
              <AddCourse
                courseCode={params.code}
                terms={add.terms}
                initialTerm={add.initialTerm}
                inPlanTerms={add.inPlanTerms}
                currentTerm={data.window.current}
                warnings={add.warnings}
                crns={add.crns}
                sectionLabels={add.sectionLabels}
                unpublishedNote={add.unpublishedNote}
                planHref={routes.plan("next")}
                loginHref={routes.login(pageHref)}
              />
            ) : (
              <p className="text-sm text-fg-2">
                {params.code} isn’t on the schedule for any term you can plan right now.
              </p>
            )}
          </section>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {course ? (
              <CourseSections
                course={course}
                chosenCrn={chosen?.crn ?? null}
                ratings={data.ratings}
                sectionHref={(crn) => `${pageHref}?crn=${crn}#week`}
                asOf={asOf}
              />
            ) : null}
            {data.aboutGate && course ? (
              <CourseAboutPanel
                termCode={params.term}
                courseCode={params.code}
                gate={data.aboutGate}
                timeZone={timeZone}
              />
            ) : null}
            <OtherTermsCard code={params.code} term={params.term} history={data.history} />
          </div>
          <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-20">
            {course && data.week ? (
              <CourseWeekCard
                code={params.code}
                term={params.term}
                week={data.week}
                chosen={chosen}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
