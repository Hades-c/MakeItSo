import Link from "next/link";
import {
  BookOpen,
  Calendar,
  CircleAlert,
  CircleCheck,
  Clock,
  ListChecks,
  MapPin,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { SeatBar } from "@/components/domain/seat-bar";
import { WeekGrid } from "@/components/domain/week-grid";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CourseCode } from "@/components/ui/course-code";
import { SourceTag } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import { compareTerms, termLabel, type TermCode } from "@/lib/term";
import type { Availability, Course, ReqCode, Section } from "@/lib/types/catalog";
import type { PlanItem } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import {
  availabilityText,
  creditsLabel,
  instructorName,
  longDays,
  meetingRoom,
  meetingTime,
  sectionLabel,
  usuallyOfferedText,
} from "../_lib/format";
import type { CoursePrograms } from "../_lib/programs";
import type { CourseWeek } from "../_lib/course";
import { BREAK_TEXT, WRAP_CHIP } from "./wrap";

/**
 * The course page's cards (PLAN §3 /courses/[term]/[code], Lakeside course.html): the index-card header, About
 * (official description, requirements, "Also counts for", prerequisites), Other terms (availability per term,
 * PLAN §5) and the week grid against the student's plan. Server components; every aggregated block carries its
 * source tag.
 */

const CARD =
  "min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5";

function CardHeading({
  id,
  title,
  children,
  focusable = false,
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
  /** A focus target for script (tabIndex -1), e.g. the week card after "Show in my week". */
  focusable?: boolean;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
      <h2
        id={id}
        tabIndex={focusable ? -1 : undefined}
        className="min-w-0 text-lg font-strong tracking-title break-words text-fg"
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// ---- Header ------------------------------------------------------------------------------------------------------

export function CourseHeader({
  course,
  term,
  chosen,
  departmentName,
  asOf,
  offered,
  inPlan = false,
}: {
  /** The course in this term, or the latest offering when it is not on this term's schedule. */
  course: Course;
  term: TermCode;
  chosen: Section | null;
  departmentName: string | null;
  asOf: string | null;
  /** The course is on this term's schedule. */
  offered: boolean;
  /** The student already has the course in their plan for this page's term (the Add to plan panel says so too). */
  inPlan?: boolean;
}) {
  const section = chosen;
  const title = course.topics && section ? section.title : course.title;
  const timed = section?.meetings.filter((meeting) => meetingTime(meeting)) ?? [];
  const rooms = [
    ...new Set(
      (section?.meetings ?? []).map(meetingRoom).filter((room): room is string => room !== null),
    ),
  ];
  const prereqs = new Set(course.sections.map((s) => s.prerequisitesText).filter(Boolean));
  const kicker = [
    departmentName ?? course.code.split(" ")[0],
    section ? `CRN ${section.crn}` : null,
    termLabel(term),
  ].filter(Boolean);

  return (
    <header
      className="relative mt-7 mb-5"
      data-aggregated="course-schedule"
      data-testid="course-header"
    >
      <CourseCode
        code={course.code}
        section={section?.section}
        variant="tab"
        size="md"
        className="absolute -top-7 left-5"
      />
      <div className="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-fg-2">
            {kicker.map((part, index) => (
              <span key={part}>
                {index > 0 ? <span aria-hidden>· </span> : null}
                {part}
              </span>
            ))}
            <SourceTag source="course-schedule" asOf={asOf} />
          </p>
          <h1 className={cn("text-2xl font-strong tracking-title text-fg md:text-3xl", BREAK_TEXT)}>
            {title}
          </h1>
          {course.topics ? (
            <p className={cn("text-sm text-fg-2", BREAK_TEXT)}>
              Topics vary by section: {course.title.replace(/: topics vary by section$/, "")}
            </p>
          ) : null}
          {section && section.instructors.length > 0 ? (
            <p className="text-sm text-fg">
              <span className="font-semibold">
                {section.instructors.map(instructorName).join(", ")}
              </span>
              {departmentName ? <span className="text-fg-2"> · {departmentName}</span> : null}
            </p>
          ) : null}
          <ul aria-label="Course facts" className="flex flex-wrap gap-2">
            {section ? (
              <li>
                <Chip variant="neutral" className={cn(WRAP_CHIP, "text-sm text-fg")}>
                  <Clock aria-hidden />
                  {timed.length > 0
                    ? timed.map((m) => `${longDays(m.days)} ${meetingTime(m)}`).join("; ")
                    : "Time TBA"}
                </Chip>
              </li>
            ) : null}
            {rooms.length > 0 ? (
              <li>
                <Chip variant="neutral" className={cn(WRAP_CHIP, "text-sm text-fg")}>
                  <MapPin aria-hidden />
                  {rooms.join(", ")}
                </Chip>
              </li>
            ) : null}
            <li>
              <Chip variant="neutral" className={cn(WRAP_CHIP, "text-sm text-fg")}>
                <BookOpen aria-hidden />
                {section ? creditsLabel([section.credits]) : creditsLabel(course.credits)}
              </Chip>
            </li>
            <li>
              <Chip variant="neutral" className={cn(WRAP_CHIP, "text-sm text-fg")}>
                <ListChecks aria-hidden />
                {prereqs.size > 0 ? "Prerequisites listed below" : "No prerequisites listed"}
              </Chip>
            </li>
          </ul>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-4 border-line lg:border-l lg:pl-8">
          {section ? (
            <SeatBar
              current={section.enrollment.current}
              max={section.enrollment.max}
              remaining={section.enrollment.remaining}
              courseCode={course.code}
            />
          ) : (
            <p className="flex items-start gap-2 text-sm text-fg" data-testid="not-offered-here">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              {offered
                ? "No sections are listed yet."
                : `Not on the ${termLabel(term)} schedule. Shown from ${termLabel(course.termCode)}.`}
            </p>
          )}
          {inPlan ? (
            <Button asChild size="lg" variant="secondary" className="w-full">
              <a href="#add-to-plan" data-testid="header-in-plan">
                <CircleCheck aria-hidden />
                In your plan · {termLabel(term)}
              </a>
            </Button>
          ) : (
            <Button asChild size="lg" className="w-full">
              <a href="#add-to-plan">
                <Plus aria-hidden />
                Add to plan
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

// ---- About -------------------------------------------------------------------------------------------------------

export interface RequirementTag {
  code: ReqCode;
  name: string;
}

/** Distinct values of a section field with the sections that have them ("A, B"). */
function distinctBySection(
  sections: readonly Section[],
  pick: (section: Section) => string | null,
): { value: string; sections: string[] }[] {
  const out = new Map<string, string[]>();
  for (const section of sections) {
    const value = pick(section)?.trim();
    if (!value) continue;
    out.set(value, [...(out.get(value) ?? []), section.section]);
  }
  return [...out].map(([value, list]) => ({ value, sections: list }));
}

export function RequirementChips({ reqs }: { reqs: readonly RequirementTag[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reqs.map((req) => (
        <li key={req.code} className="max-w-full min-w-0">
          <Chip variant="neutral" className={cn(WRAP_CHIP, "text-fg")}>
            <span>
              {req.name} <span className="font-mono text-fg-3">{req.code}</span>
            </span>
          </Chip>
        </li>
      ))}
    </ul>
  );
}

export function CourseAboutCard({
  course,
  requirements,
  requirementsBySection,
  programs,
  disclaimer,
  asOf,
}: {
  course: Course;
  requirements: RequirementTag[];
  /**
   * Requirements per group of sections when the sections disagree (NONE vs no data, topics sections); when
   * omitted or a single group, `requirements` is shown for the whole course.
   */
  requirementsBySection?: { sections: string[]; reqs: RequirementTag[] | null }[];
  programs: CoursePrograms | null;
  disclaimer: string;
  asOf: string | null;
}) {
  const descriptions = distinctBySection(course.sections, (s) => s.descriptionText);
  const prereqs = distinctBySection(course.sections, (s) => s.prerequisitesText);
  const several = (list: { sections: string[] }[]) => list.length > 1;
  return (
    <section aria-labelledby="about-title" className={CARD} data-aggregated="course-schedule">
      <CardHeading id="about-title" title="About">
        <SourceTag source="course-schedule" asOf={asOf} />
      </CardHeading>
      {descriptions.length === 0 ? (
        <p className="text-sm text-fg-2">The schedule has no description for this course.</p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="course-description">
          {descriptions.map((entry) => (
            <div key={entry.value}>
              {several(descriptions) ? (
                <p className="mb-1 font-mono text-xs font-semibold text-fg-2">
                  Section {entry.sections.join(", ")}
                </p>
              ) : null}
              <p
                className={cn("text-base leading-relaxed whitespace-pre-line text-fg", BREAK_TEXT)}
              >
                {entry.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-4 text-sm md:grid-cols-[9rem_minmax(0,1fr)]">
        <dt className="font-mono text-xs text-fg-3 md:pt-0.5">Requirements</dt>
        <dd className="min-w-0" data-testid="course-requirements">
          {requirementsBySection && requirementsBySection.length > 1 ? (
            <ul className="flex flex-col gap-2" data-testid="requirements-by-section">
              {requirementsBySection.map((group) => (
                <li key={group.sections.join(",")} className="flex flex-col gap-1">
                  <span className="font-mono text-xs font-semibold text-fg-2">
                    {group.sections.length === 1 ? "Section" : "Sections"}{" "}
                    {group.sections.join(", ")}
                  </span>
                  {group.reqs && group.reqs.length > 0 ? (
                    <RequirementChips reqs={group.reqs} />
                  ) : (
                    <span className="text-fg-2">No requirement data in the schedule</span>
                  )}
                </li>
              ))}
            </ul>
          ) : requirements.length > 0 ? (
            <RequirementChips reqs={requirements} />
          ) : (
            <span className="text-fg-2">No requirement data in the schedule</span>
          )}
          <p className="mt-1.5 text-xs text-fg-3">{disclaimer}</p>
        </dd>

        <dt className="font-mono text-xs text-fg-3 md:pt-0.5">Also counts for</dt>
        <dd className="min-w-0" data-aggregated="catalog" data-testid="also-counts-for">
          {programs === null ? (
            <span className="text-fg-2">The catalog’s programs can’t be read right now.</span>
          ) : programs.matches.length === 0 && programs.pagesRead === 0 ? (
            <span className="text-fg-2" data-testid="programs-not-read">
              The catalog’s program pages haven’t been read yet.
            </span>
          ) : programs.matches.length === 0 && programs.pagesRead < programs.pagesTotal ? (
            // No negative claim from part of the catalog: the unread pages may well name the course.
            <span className="text-fg-2" data-testid="programs-incomplete">
              Not every program page in the catalog has been read yet.
            </span>
          ) : programs.matches.length === 0 ? (
            <span className="text-fg-2">No major or minor in the catalog names this course.</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {programs.matches.map((match) => (
                <li key={match.name}>
                  <a
                    href={match.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-fg underline decoration-line-strong underline-offset-2 hover:text-primary md:inline md:min-h-0"
                  >
                    {match.name}
                    <span className="sr-only"> (catalog page, opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <SourceTag source="catalog" />
            {programs && programs.pagesRead > 0 && programs.pagesRead < programs.pagesTotal
              ? `Based on ${programs.pagesRead} of ${programs.pagesTotal} program pages`
              : null}
          </p>
        </dd>

        <dt id="prerequisites" className="font-mono text-xs text-fg-3 md:pt-0.5">
          Prerequisites
        </dt>
        <dd className="min-w-0" data-testid="course-prerequisites">
          {prereqs.length === 0 ? (
            <span className="text-fg">None listed</span>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {prereqs.map((entry) => (
                <li key={entry.value} className={cn("text-fg", BREAK_TEXT)}>
                  {several(prereqs) ? (
                    <span className="mr-1 font-mono text-xs font-semibold text-fg-2">
                      {entry.sections.join(", ")}:
                    </span>
                  ) : null}
                  {entry.value}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </section>
  );
}

// ---- Other terms -------------------------------------------------------------------------------------------------

export function OtherTermsCard({
  code,
  term,
  history,
}: {
  code: string;
  term: TermCode;
  history: readonly Availability[];
}) {
  const entries = [...history].sort((a, b) => compareTerms(b.termCode, a.termCode));
  return (
    <section aria-labelledby="terms-title" className={CARD} data-aggregated="course-schedule">
      <CardHeading id="terms-title" title="Other terms">
        <SourceTag source="course-schedule" />
      </CardHeading>
      <ul className="divide-y divide-line" data-testid="other-terms">
        {entries.map((entry) => {
          const usually = usuallyOfferedText(entry);
          const here = entry.termCode === term;
          return (
            <li
              key={entry.termCode}
              data-term={entry.termCode}
              data-status={entry.status}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Calendar aria-hidden className="size-4 text-fg-3" />
                {entry.status === "offered" && !here ? (
                  <Link
                    href={routes.course(entry.termCode, code)}
                    className="inline-flex min-h-11 items-center text-primary hover:underline md:min-h-0"
                  >
                    {termLabel(entry.termCode)}
                  </Link>
                ) : (
                  termLabel(entry.termCode)
                )}
                {here ? <span className="text-xs font-medium text-fg-3">(this page)</span> : null}
              </span>
              <span className={cn("text-sm", entry.status === "offered" ? "text-fg" : "text-fg-2")}>
                {availabilityText(entry)}
                {usually ? <span className="block text-xs text-fg-2">{usually}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- Week --------------------------------------------------------------------------------------------------------

export function CourseWeekCard({
  code,
  term,
  week,
  chosen,
}: {
  code: string;
  term: TermCode;
  week: CourseWeek;
  chosen: Section | null;
}) {
  // Classes the chosen section overlaps (one per other section, however many days).
  const conflicts = chosen
    ? new Set(week.view.chosenConflicts.map((c) => (c.a.crn === chosen.crn ? c.b.crn : c.a.crn)))
        .size
    : 0;
  return (
    <section
      id="week"
      aria-labelledby="week-title"
      className={cn(CARD, "scroll-mt-24")}
      data-aggregated="my-plan"
      data-testid="course-week"
    >
      <CardHeading id="week-title" title={`Your week with ${code}`} focusable>
        <span className="flex items-center gap-2">
          {chosen ? (
            conflicts > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-wash px-2 py-0.5 text-xs font-semibold text-danger">
                <TriangleAlert aria-hidden className="size-3.5" />
                {conflicts === 1 ? "1 conflict" : `${conflicts} conflicts`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-wash px-2 py-0.5 text-xs font-semibold text-success">
                <CircleCheck aria-hidden className="size-3.5" />
                {week.unplaced.length > 0 ? "No conflicts among chosen sections" : "No conflicts"}
              </span>
            )
          ) : null}
          <SourceTag source="my-plan" />
        </span>
      </CardHeading>
      <p className="mb-3 text-sm text-fg-2">
        {termLabel(term)} classes in your plan
        {chosen
          ? week.view.chosenTentative
            ? `, with ${sectionLabel(chosen)} dashed (not in your plan yet).`
            : `, including ${sectionLabel(chosen)}.`
          : "."}
      </p>
      {/* overflow-wrap is inherited: long unbroken titles in the grid's day list wrap at 360px. */}
      <div className={cn("min-w-0", BREAK_TEXT)}>
        <WeekGrid
          startHour={week.view.startHour}
          endHour={week.view.endHour}
          blocks={week.view.blocks}
          label={`Your week with ${code}`}
        />
      </div>
      {week.plannedOtherSection ? (
        <p className="mt-3 text-sm text-fg-2">
          Your plan has {week.plannedOtherSection}; the grid shows the section you picked instead.
        </p>
      ) : null}
      {week.unplaced.length > 0 ? <UnplacedList items={week.unplaced} term={term} /> : null}
    </section>
  );
}

function UnplacedList({ items, term }: { items: readonly PlanItem[]; term: TermCode }) {
  return (
    <div className="mt-3 text-sm text-fg-2">
      <p>Not on the grid and not checked for conflicts (no section chosen yet):</p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={routes.course(term, item.courseCode)}
              className="inline-flex min-h-11 items-center font-mono text-xs font-semibold text-primary hover:underline md:min-h-0"
            >
              {item.courseCode}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
