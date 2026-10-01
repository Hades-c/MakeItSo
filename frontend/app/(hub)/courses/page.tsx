import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SourceTag } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import { termLabel } from "@/lib/term";
import { requireUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { coursesHref, hasFilters, parseCoursesQuery, type CoursesSearchParams } from "./_lib/query";
import { loadSearch } from "./_lib/search";
import { loadStudentPlan } from "./_lib/student";
import { RESULTS_HEADING_ID } from "./_components/clean-get-form";
import { CourseFilters } from "./_components/course-filters";
import { CourseRow } from "./_components/course-row";
import { ResultsHeading } from "./_components/results-heading";

export const metadata: Metadata = { title: "Courses" };

/**
 * /courses (PLAN §3): search Davidson's course schedule. The term selector defaults to the term browsing defaults
 * to (server/catalog browseTerm: the registration term once its schedule is published); the search text, every
 * filter, the term and the page live in the URL (a GET form). Each result can be added to the plan, with the
 * warnings the add would carry. Server component: calls the catalog and plan services directly.
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<CoursesSearchParams>;
}) {
  const user = await requireUser();
  const { query, ignored } = parseCoursesQuery(await searchParams);
  const plan = await loadStudentPlan(user.id, now());
  const view = await loadSearch(query, plan);
  const { term, result } = view;
  const loginHref = routes.login(coursesHref(query, term));
  const planHref = routes.plan("next");
  const total = result?.total ?? 0;
  const pageSize = result?.pageSize ?? 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = result?.page ?? 1;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const showsResults = !view.error && total > 0 && view.rows.length > 0;
  const status = view.error
    ? "The course schedule is unavailable"
    : showsResults
      ? `${pages > 1 ? `${first}–${last} of ` : ""}${total} ${total === 1 ? "course" : "courses"} in ${termLabel(term)}`
      : total > 0
        ? `There is no page ${page} of these results`
        : `No ${termLabel(term)} courses found`;
  const navKey = coursesHref(query, term);

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle="Search Davidson’s course schedule by department, requirement, meeting time and open seats."
      />
      <CourseFilters
        query={query}
        term={term}
        termOptions={view.termOptions}
        filters={view.filters}
      />
      {ignored.length > 0 ? (
        <p className="mb-4 text-sm text-fg-2" data-testid="ignored-params">
          Some search settings in the link were not valid and were ignored.
        </p>
      ) : null}

      {/* Mounted in every state, so the live region announces each new search. */}
      <div
        className={
          showsResults
            ? "mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
            : undefined
        }
      >
        <ResultsHeading
          navKey={navKey}
          visible={showsResults}
          className="text-base font-semibold text-fg"
        >
          {status}
        </ResultsHeading>
        {showsResults ? (
          <p className="flex items-center gap-2 text-xs text-fg-2">
            Schedule data
            <SourceTag source="course-schedule" asOf={result?.asOf ?? null} />
          </p>
        ) : null}
      </div>

      {view.error ? (
        <ErrorState
          title="The course schedule is unavailable"
          description={view.error}
          action={
            <Button asChild variant="secondary">
              <Link href={coursesHref(query, term)}>Try again</Link>
            </Button>
          }
        />
      ) : total > 0 && view.rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`There is no page ${page} of these results`}
          action={
            <Button asChild variant="secondary">
              <Link href={coursesHref(query, term, { page: 1 })}>Go to the first page</Link>
            </Button>
          }
        />
      ) : total === 0 ? (
        <EmptyState
          icon={SearchX}
          title={
            view.unavailableBefore
              ? `No ${termLabel(term)} schedule in MakeItSo`
              : hasFilters(query)
                ? `No ${termLabel(term)} courses match${query.q ? ` “${query.q}”` : ""}`
                : `No ${termLabel(term)} courses yet`
          }
          description={
            view.unavailableBefore ? (
              <p>
                MakeItSo keeps Davidson’s schedules from {termLabel(view.unavailableBefore)} on.
                Choose a later term.
              </p>
            ) : hasFilters(query) ? (
              <p>Try fewer filters, another term, or a different word.</p>
            ) : (
              <p>The {termLabel(term)} schedule has no courses in it yet.</p>
            )
          }
          action={
            view.unavailableBefore ? (
              <Button asChild variant="secondary">
                <Link href={routes.courses()}>Search the latest schedule</Link>
              </Button>
            ) : hasFilters(query) ? (
              <Button asChild variant="secondary">
                <Link href={routes.courses({ term })}>Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section aria-labelledby={RESULTS_HEADING_ID}>
          <ol className="flex flex-col gap-3" data-testid="course-results">
            {view.rows.map((row) => (
              <li key={row.summary.code}>
                <CourseRow
                  row={row}
                  currentTerm={view.window.current}
                  planHref={planHref}
                  loginHref={loginHref}
                />
              </li>
            ))}
          </ol>
          {pages > 1 ? (
            <nav aria-label="Result pages" className="mt-5 flex items-center justify-between gap-3">
              {page > 1 ? (
                <Button asChild variant="secondary">
                  <Link href={coursesHref(query, term, { page: page - 1 })} rel="prev">
                    <ChevronLeft aria-hidden />
                    Previous
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-sm text-fg-2">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Button asChild variant="secondary">
                  <Link href={coursesHref(query, term, { page: page + 1 })} rel="next">
                    Next
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      )}
    </>
  );
}
