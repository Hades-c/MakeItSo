import Link from "next/link";
import { CircleAlert, Clock } from "lucide-react";
import { CourseCode } from "@/components/ui/course-code";
import { Chip } from "@/components/ui/chip";
import { SourceTag } from "@/components/ui/source-tag";
import type { TermCode } from "@/lib/term";
import { cn } from "@/lib/utils";
import { creditsLabel, openSeatsLabel, sectionsLabel } from "../_lib/format";
import type { CourseRow as Row } from "../_lib/search";
import { AddCourse } from "./add-course";

/**
 * One /courses result (PLAN §3): code, title (a topics course says "topics vary by section" and lists each
 * section's own title), credits, requirement tags under their official names, open seats, meeting times,
 * instructors, availability across the plan window (the Add to plan tiles) and "Add to <term>" with its warnings.
 * An aggregated item: tagged COURSE SCHEDULE.
 */
export function CourseRow({
  row,
  currentTerm,
  planHref,
  loginHref,
}: {
  row: Row;
  currentTerm: TermCode;
  planHref: string;
  loginHref: string;
}) {
  const { summary } = row;
  const titleId = `course-${summary.code.replace(/\s+/g, "-")}-title`;
  const instructors = [...new Set(row.sections.flatMap((section) => section.instructors))];
  return (
    <article
      aria-labelledby={titleId}
      data-aggregated="course-schedule"
      data-course={summary.code}
      className="grid min-w-0 gap-4 rounded-xl border border-line bg-surface p-4 shadow-card md:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CourseCode code={summary.code} variant="chip" size="md" />
          <SourceTag source="course-schedule" />
          <span
            className={cn(
              "ml-auto text-sm font-semibold",
              summary.openSeats > 0 ? "text-fg" : "text-warning",
            )}
            data-testid="row-seats"
          >
            {openSeatsLabel(summary.openSeats)}
          </span>
        </div>
        <h3 id={titleId} className="text-lg font-strong tracking-title text-fg">
          <Link
            href={row.href}
            className="inline-flex min-h-11 items-center rounded-sm hover:underline md:inline md:min-h-0"
          >
            <span>
              {summary.title} <span className="sr-only">({summary.code})</span>
            </span>
          </Link>
        </h3>
        <p className="text-sm text-fg-2">
          {creditsLabel(summary.credits)} · {sectionsLabel(summary.sectionCount)}
          {summary.crossListings.length > 0 ? (
            <> · Also listed as {summary.crossListings.join(", ")}</>
          ) : null}
        </p>
        {row.reqs.length > 0 ? (
          <ul aria-label="Requirements" className="flex flex-wrap gap-1.5">
            {row.reqs.map((req) => (
              <li key={req.code}>
                <Chip variant="neutral" title={req.code}>
                  {req.name}
                  <span className="font-mono text-fg-3">{req.code}</span>
                </Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-fg-3">No requirement data in the schedule</p>
        )}
        {row.sections.length > 0 ? (
          <ul aria-label="Sections" className="flex flex-col gap-1.5" data-testid="row-sections">
            {row.sections.map((section) => (
              <li
                key={section.crn}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
              >
                <span className="font-mono text-xs font-semibold text-fg">{section.section}</span>
                {summary.topics ? (
                  <span className="font-semibold text-fg">{section.title}</span>
                ) : null}
                <span className="inline-flex items-baseline gap-1 font-mono text-xs text-fg-2">
                  <Clock aria-hidden className="size-3.5 shrink-0 self-center" />
                  {section.times.join(" · ")}
                </span>
                <span className="text-fg-2">{section.instructors.join(", ")}</span>
                {section.registerAs ? (
                  <span className="text-xs font-semibold text-fg-2">{section.registerAs}</span>
                ) : null}
              </li>
            ))}
            {row.moreSections > 0 ? (
              <li className="text-xs text-fg-3">
                + {sectionsLabel(row.moreSections)} more on the course page
              </li>
            ) : null}
          </ul>
        ) : null}
        {instructors.length === 0 && summary.instructorNames.length > 0 ? (
          <p className="text-sm text-fg-2">{summary.instructorNames.join(", ")}</p>
        ) : null}
      </div>
      <div className="min-w-0">
        {row.add ? (
          <AddCourse
            courseCode={summary.code}
            terms={row.add.terms}
            initialTerm={row.add.initialTerm}
            inPlanTerms={row.add.inPlanTerms}
            currentTerm={currentTerm}
            warnings={row.add.warnings}
            unpublishedNote={row.add.unpublishedNote}
            planHref={planHref}
            loginHref={loginHref}
          />
        ) : (
          <p
            className="flex items-center gap-1.5 text-sm text-fg-2"
            data-testid="availability-unknown"
          >
            <CircleAlert aria-hidden className="size-4 shrink-0 text-taupe" />
            Availability for this course can’t be read right now.
          </p>
        )}
      </div>
    </article>
  );
}
