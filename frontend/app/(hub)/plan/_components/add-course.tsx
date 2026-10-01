"use client";

import * as React from "react";
import { LoaderCircle, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { Input, controlClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SourceTag } from "@/components/ui/source-tag";
import { callApi } from "@/lib/api/client";
import { catalogApi } from "@/lib/api/catalog";
import { courseSlug } from "@/lib/routes";
import type { CourseSummary, Section } from "@/lib/types/catalog";
import { normalizeCourseCode } from "@/lib/types/common";
import type { WebTreeList } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { errorMessage } from "../_lib/errors";
import { meetingsText } from "../_lib/week";
import { listedCrns, MAX_ALTERNATES, MAX_CHOICES } from "../_lib/webtree-edit";

/**
 * "Add a course" for the WebTree list: pick a course from the plan (the courses already planned for the term) or
 * from a catalog search (GET /api/catalog/search, the public catalog route), then one of its sections (GET
 * /api/catalog/courses/[term]/[code]) and where it goes: a new choice at the end, or an alternate for a choice.
 * The parent applies the edit and saves the list.
 */

export interface PickedSection {
  crn: string;
  courseCode: string;
  section: string;
  title: string;
  meetings: Section["meetings"];
  instructors: string[];
  enrollment: Section["enrollment"];
}

/** "new" or the rank of the choice an alternate is for. */
export type AddTarget = "new" | number;

export interface AddCourseProps {
  termCode: string;
  termLabel: string;
  list: WebTreeList;
  /** Courses planned for this term ("Add from your plan"). */
  planCourses: readonly { courseCode: string; title: string; crn: string | null }[];
  target: AddTarget;
  onTargetChange: (target: AddTarget) => void;
  onAdd: (section: PickedSection, target: AddTarget) => void;
  /** The search box (the parent focuses it for "Add alternate"). */
  searchRef?: React.Ref<HTMLInputElement>;
  disabled?: boolean;
}

type Loaded<T> = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | T;

function picked(section: Section): PickedSection {
  return {
    crn: section.crn,
    courseCode: section.courseCode,
    section: section.section,
    title: section.title,
    meetings: section.meetings,
    instructors: section.instructors.map((person) =>
      person.isStaff ? "Staff (TBA)" : `${person.first} ${person.last}`.trim(),
    ),
    enrollment: section.enrollment,
  };
}

function seatsText(enrollment: Section["enrollment"]): string {
  if (enrollment.max <= 0) return "no seats of its own";
  if (enrollment.remaining < 0) return "over-enrolled";
  return `${Math.max(0, enrollment.remaining)} of ${enrollment.max} seats open`;
}

export function AddCourse({
  termCode,
  termLabel,
  list,
  planCourses,
  target,
  onTargetChange,
  onAdd,
  searchRef,
  disabled,
}: AddCourseProps) {
  const idBase = React.useId();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<
    Loaded<{ state: "done"; items: CourseSummary[]; total: number }>
  >({
    state: "idle",
  });
  const [course, setCourse] = React.useState<string | null>(null);
  const [sections, setSections] = React.useState<Loaded<{ state: "done"; sections: Section[] }>>({
    state: "idle",
  });
  const [crn, setCrn] = React.useState<string | null>(null);
  const sectionsHeading = React.useRef<HTMLHeadingElement>(null);

  const listed = listedCrns(list);
  const listedCodes = new Set(list.choices.map((choice) => normalizeCourseCode(choice.courseCode)));
  const fromPlan = planCourses.filter(
    (entry) => !listedCodes.has(normalizeCourseCode(entry.courseCode)),
  );
  const targetChoice =
    target === "new" ? null : (list.choices.find((choice) => choice.rank === target) ?? null);
  const full =
    target === "new"
      ? list.choices.length >= MAX_CHOICES
      : (targetChoice?.alternates.length ?? 0) >= MAX_ALTERNATES;

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) {
      setResults({ state: "error", message: "Type a course code, title or instructor to search." });
      return;
    }
    setResults({ state: "loading" });
    try {
      const found = await callApi(catalogApi.search, { query: { term: termCode, q, pageSize: 8 } });
      setResults({ state: "done", items: found.items, total: found.total });
    } catch (error) {
      setResults({
        state: "error",
        message: errorMessage(error, "The search did not work. Please try again."),
      });
    }
  };

  const chooseCourse = async (code: string, preferredCrn: string | null) => {
    setCourse(code);
    setCrn(null);
    setSections({ state: "loading" });
    try {
      const found = await callApi(catalogApi.course, {
        params: { term: termCode, code: courseSlug(code) },
      });
      const open = found.course.sections;
      setSections({ state: "done", sections: open });
      const first = open.find((section) => !listed.has(section.crn));
      setCrn(
        preferredCrn &&
          open.some((section) => section.crn === preferredCrn && !listed.has(section.crn))
          ? preferredCrn
          : (first?.crn ?? null),
      );
      requestAnimationFrame(() => sectionsHeading.current?.focus());
    } catch (error) {
      setSections({
        state: "error",
        message: errorMessage(error, `${code} has no ${termLabel} sections to choose from.`),
      });
    }
  };

  const chosen =
    sections.state === "done"
      ? sections.sections.find((section) => section.crn === crn)
      : undefined;

  return (
    <div className="flex flex-col gap-4" data-testid="webtree-add">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-target`}>Add as</Label>
        <select
          id={`${idBase}-target`}
          className={cn(controlClass, "h-11 px-3 md:h-10")}
          value={String(target)}
          onChange={(event) =>
            onTargetChange(event.target.value === "new" ? "new" : Number(event.target.value))
          }
        >
          <option value="new">A new choice (rank {list.choices.length + 1})</option>
          {list.choices.map((choice) => (
            <option key={choice.crn} value={choice.rank}>
              An alternate for choice {choice.rank} ({choice.courseCode})
            </option>
          ))}
        </select>
        {full ? (
          <p className="text-xs text-fg-2">
            {target === "new"
              ? `The list already holds ${MAX_CHOICES} choices.`
              : `Choice ${target} already has ${MAX_ALTERNATES} alternates.`}
          </p>
        ) : null}
      </div>

      {fromPlan.length > 0 ? (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-fg">
            From your {termLabel} plan <SourceTag source="my-plan" />
          </h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {fromPlan.map((entry) => (
              <li key={entry.courseCode} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CourseCode code={entry.courseCode} />
                <span className="min-w-0 flex-1 text-sm text-fg-2">{entry.title}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void chooseCourse(entry.courseCode, entry.crn)}
                >
                  Choose a section <span className="sr-only">of {entry.courseCode}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        role="search"
        onSubmit={(event) => void search(event)}
        className="flex flex-col gap-1.5"
      >
        <Label htmlFor={`${idBase}-q`}>Search the {termLabel} schedule</Label>
        <div className="flex gap-2">
          <Input
            ref={searchRef}
            id={`${idBase}-q`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. CSC 221, data, Spanish"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" disabled={results.state === "loading"}>
            {results.state === "loading" ? (
              <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Search aria-hidden />
            )}
            Search
          </Button>
        </div>
      </form>

      <div aria-live="polite">
        {results.state === "error" ? (
          <p className="text-sm text-danger">{results.message}</p>
        ) : results.state === "done" ? (
          results.items.length === 0 ? (
            <p className="text-sm text-fg-2">
              No {termLabel} courses match “{query.trim()}”.
            </p>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-xs text-fg-3">
                {results.total > results.items.length
                  ? `First ${results.items.length} of ${results.total} courses`
                  : `${results.items.length} ${results.items.length === 1 ? "course" : "courses"}`}{" "}
                <SourceTag source="course-schedule" />
              </p>
              <ul className="mt-2 flex flex-col gap-1.5" aria-label="Search results">
                {results.items.map((item) => (
                  <li key={item.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CourseCode code={item.code} />
                    <span className="min-w-0 flex-1 text-sm text-fg-2">
                      {item.title}{" "}
                      <span className="text-fg-3">
                        · {item.sectionCount} {item.sectionCount === 1 ? "section" : "sections"}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => void chooseCourse(item.code, null)}
                    >
                      Choose a section <span className="sr-only">of {item.code}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}
      </div>

      {course ? (
        <div className="rounded-lg border border-line p-3" data-testid="section-picker">
          <h4
            ref={sectionsHeading}
            tabIndex={-1}
            className="text-sm font-semibold text-fg outline-none"
          >
            {course} sections in {termLabel}
          </h4>
          {sections.state === "loading" ? (
            <p className="mt-2 text-sm text-fg-2">Loading sections…</p>
          ) : sections.state === "error" ? (
            <p className="mt-2 text-sm text-danger">{sections.message}</p>
          ) : sections.state === "done" ? (
            <form
              className="mt-2 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (chosen) onAdd(picked(chosen), target);
              }}
            >
              <fieldset className="flex flex-col gap-1.5">
                <legend className="sr-only">Section of {course}</legend>
                {sections.sections.map((section) => {
                  const taken = listed.has(section.crn);
                  return (
                    <label
                      key={section.crn}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2",
                        taken && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${idBase}-crn`}
                        value={section.crn}
                        checked={crn === section.crn}
                        disabled={taken}
                        onChange={() => setCrn(section.crn)}
                        className="mt-1 size-4 accent-primary-fill"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold text-fg">
                          {section.courseCode} {section.section}
                        </span>{" "}
                        <span className="font-mono text-xs text-fg-2">CRN {section.crn}</span>
                        {taken ? <span className="text-fg-2"> · already on your list</span> : null}
                        <span className="block text-fg-2">
                          {meetingsText(section.meetings).join("; ")} ·{" "}
                          {seatsText(section.enrollment)}
                        </span>
                        {section.instructors.length > 0 ? (
                          <span className="block text-xs text-fg-3">
                            {picked(section).instructors.join(", ")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <div>
                <Button type="submit" disabled={!chosen || full || disabled}>
                  <Plus aria-hidden />
                  {target === "new"
                    ? `Add as choice ${list.choices.length + 1}`
                    : `Add as an alternate for choice ${target}`}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
