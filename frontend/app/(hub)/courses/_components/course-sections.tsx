import Link from "next/link";
import { Clock, MapPin, TriangleAlert } from "lucide-react";
import { SeatBar } from "@/components/domain/seat-bar";
import { Chip } from "@/components/ui/chip";
import { routes } from "@/lib/routes";
import type { Course, Section } from "@/lib/types/catalog";
import { cn } from "@/lib/utils";
import {
  instructorName,
  meetingRoom,
  meetingText,
  orderedMeetings,
  restrictionFlags,
} from "../_lib/format";
import type { RatingsLookup } from "../_lib/ratings";
import type { RegisterAs } from "../_lib/sections";
import { InstructorRatings, ratedInstructors } from "./instructor-ratings";
import { WRAP_CHIP } from "./wrap";
import { ShowInWeekLink } from "./week-focus";

/**
 * Every section of the course in the term (PLAN §5 "Sections"): CRN, section, its own title when it differs,
 * meetings ("Time TBA" when there is no time), room, instructors in upstream order by name only ("Staff (TBA)"),
 * seats ("Over-enrolled" when the API reports more than max), the notes verbatim, restriction flags, "Register as
 * <sibling>" for a max-0 cross-listing, the hidden registration-only listings ("Also registrable as …") and
 * "Registration section for …". "Show in my week" picks the section the week grid and the header show (?crn= in
 * the URL). What RateMyProfessors says appears once per instructor, under the sections, however many sections they
 * teach (InstructorRatings, its own component, so it can move): never again on the section rows.
 */

export function SectionItem({
  section,
  course,
  chosen,
  sectionHref,
  registerAs = null,
  regForTitle = null,
}: {
  section: Section;
  course: Pick<Course, "title" | "topics">;
  chosen: boolean;
  sectionHref: string;
  /** The sibling a max-0 listing registers under (resolved on the server: the first sibling with seats). */
  registerAs?: RegisterAs | null;
  /** The title of the course a registration-only listing belongs to. */
  regForTitle?: string | null;
}) {
  const sibling = registerAs;
  const flags = restrictionFlags(section);
  const ownTitle = course.topics || section.title !== course.title;
  return (
    <article
      aria-label={`Section ${section.section}, CRN ${section.crn}`}
      data-crn={section.crn}
      data-source="course-schedule"
      data-chosen={chosen ? "" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border p-4",
        chosen ? "border-primary bg-primary-wash/40" : "border-line bg-surface",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3
          id={`section-${section.crn}-title`}
          tabIndex={-1}
          className="flex flex-wrap items-baseline gap-x-2 text-base font-strong text-fg"
        >
          <span className="text-sm">Section {section.section}</span>
          <span className="font-mono text-xs font-medium text-fg-2">CRN {section.crn}</span>
        </h3>
        {chosen ? (
          <span className="text-xs font-semibold text-primary">Shown in your week</span>
        ) : (
          <ShowInWeekLink href={sectionHref}>
            Show in my week
            <span className="sr-only"> (section {section.section})</span>
          </ShowInWeekLink>
        )}
      </div>
      {ownTitle ? (
        <p className="text-sm font-semibold break-words text-fg">{section.title}</p>
      ) : null}

      <ul aria-label="Meetings" className="flex flex-col gap-1">
        {(section.meetings.length > 0 ? orderedMeetings(section.meetings) : [null]).map(
          (meeting, index) => {
            const room = meeting ? meetingRoom(meeting) : null;
            return (
              <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5 text-xs text-fg">
                  <Clock aria-hidden className="size-3.5 shrink-0 text-fg-3" />
                  {meeting ? meetingText(meeting, "long") : "Time TBA"}
                </span>
                {room ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 break-words text-fg-2">
                    <MapPin aria-hidden className="size-3.5 shrink-0 text-fg-3" />
                    {room}
                  </span>
                ) : null}
              </li>
            );
          },
        )}
      </ul>

      <ul aria-label="Instructors" className="flex flex-col gap-1.5">
        {section.instructors.length === 0 ? (
          <li className="text-sm text-fg-2">Staff (TBA)</li>
        ) : (
          section.instructors.map((instructor, index) => (
            <li
              key={`${instructor.first}-${instructor.last}-${index}`}
              className="text-sm font-semibold text-fg"
            >
              {instructorName(instructor)}
            </li>
          ))
        )}
      </ul>

      <SeatBar
        size="sm"
        current={section.enrollment.current}
        max={section.enrollment.max}
        remaining={section.enrollment.remaining}
        courseCode={section.courseCode}
      />

      {sibling ? (
        <p className="text-sm font-semibold text-fg" data-testid="register-as">
          Register as{" "}
          <Link href={sibling.href} className="link">
            {sibling.label}
          </Link>{" "}
          <span className="font-mono text-xs font-medium text-fg-2">(CRN {sibling.crn})</span>
        </p>
      ) : section.crossListings.length > 0 ? (
        <p className="text-sm text-fg-2">
          Cross-listed as{" "}
          {section.crossListings.map((listing, index) => (
            <span key={listing.crn}>
              {index > 0 ? ", " : null}
              <Link
                href={routes.course(section.termCode, listing.courseCode)}
                className="font-semibold link"
              >
                {listing.courseCode} {listing.section}
              </Link>
            </span>
          ))}{" "}
          (one class, counted once)
        </p>
      ) : null}
      {section.registrationSections.length > 0 ? (
        <p className="text-sm text-fg-2" data-testid="registration-sections">
          Also registrable as{" "}
          {section.registrationSections
            .map((listing) => `${listing.courseCode} ${listing.section} (CRN ${listing.crn})`)
            .join(", ")}
        </p>
      ) : null}
      {section.regFor ? (
        <p className="text-sm text-fg-2">
          Registration section for{" "}
          <Link
            href={routes.course(section.termCode, section.regFor)}
            className="font-semibold break-words link"
          >
            {regForTitle ? `${regForTitle} (${section.regFor})` : section.regFor}
          </Link>
        </p>
      ) : null}

      {flags.length > 0 ? (
        <ul aria-label="Restrictions" className="flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <li key={flag}>
              <Chip variant="outline" className={cn(WRAP_CHIP, "text-fg")}>
                <TriangleAlert aria-hidden className="text-warning" />
                {flag}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
      {section.notes.length > 0 ? (
        <div>
          <p className="text-xs font-semibold tracking-label text-fg-3 uppercase">
            Registrar’s notes
          </p>
          <ul
            className="mt-1 list-disc pl-5 text-sm break-words text-fg-2"
            data-testid="section-notes"
          >
            {section.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function CourseSections({
  course,
  chosenCrn,
  ratings,
  sectionHref,
  registerAs = {},
  regForTitles = {},
}: {
  course: Course;
  chosenCrn: string | null;
  ratings: RatingsLookup | null;
  sectionHref: (crn: string) => string;
  registerAs?: Readonly<Record<string, RegisterAs>>;
  regForTitles?: Readonly<Record<string, string>>;
}) {
  return (
    <section
      id="sections"
      aria-labelledby="sections-title"
      className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5"
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="sections-title"
          className="flex items-center gap-2 font-display text-lg font-strong tracking-title text-fg"
        >
          Sections{" "}
          <span className="font-sans text-xs font-medium text-fg-3 tabular-nums">
            {course.sections.length}
          </span>
        </h2>
      </div>
      <ul className="flex flex-col gap-3">
        {course.sections.map((section) => (
          <li key={section.crn}>
            <SectionItem
              section={section}
              course={course}
              chosen={section.crn === chosenCrn}
              sectionHref={sectionHref(section.crn)}
              registerAs={registerAs[section.crn] ?? null}
              regForTitle={section.regFor ? (regForTitles[section.regFor] ?? null) : null}
            />
          </li>
        ))}
      </ul>
      <InstructorRatings
        instructors={ratedInstructors(course.sections, ratings)}
        className="mt-4 border-t border-line pt-4"
      />
      <p className="mt-3 text-xs text-fg-3">
        Seats and notes as the Registrar publishes them
        {ratings
          ? "; ratings only where a RateMyProfessors profile matches the instructor’s full name."
          : "."}
      </p>
    </section>
  );
}
