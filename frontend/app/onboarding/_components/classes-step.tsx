"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { courseSlug } from "@/lib/routes";
import { callApi } from "@/lib/api/client";
import { catalogApi } from "@/lib/api/catalog";
import { termLabel, type TermCode } from "@/lib/term";
import type { Course, CourseSummary, Section } from "@/lib/types/catalog";
import type { PlanItem, PlanWarning } from "@/lib/types/plan";
import { describeFailure } from "../_lib/errors";
import {
  autoSection,
  classAction,
  classAddBody,
  findActiveItem,
  instructorLabel,
  meetingLabel,
  termItems,
} from "../_lib/plan-items";
import { CourseSearch } from "./course-search";
import { ContinueLink, PlanItemRow, StatusLine, StepActions } from "./parts";
import { usePlanItems } from "./use-plan-items";

/**
 * Step 2, "Your Fall 2026 classes": search the current term and pick the section you are in. A course with one
 * section is added with it straight away (auto-select); otherwise the sections are listed as radio buttons. Each
 * choice becomes a plan item with its CRN (status in-progress once the term has started). Re-running never
 * duplicates: a course already in the term's plan is shown as such, and picking a section for it only sets the
 * CRN (classAction).
 */

export interface ClassesStepProps {
  term: TermCode;
  termLabel: string;
  status: "in-progress" | "registered";
  startsLater: boolean;
  firstTerm: TermCode;
  items: PlanItem[];
}

interface Picker {
  code: string;
  course: Course | null;
  loading: boolean;
  error: string | null;
  crn: string;
}

export function ClassesStep(props: ClassesStepProps) {
  const { term, status } = props;
  const plan = usePlanItems(props.items);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<PlanWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const current = termItems(plan.items, term);

  if (props.startsLater) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-fg-2">
          You start at Davidson in {termLabel(props.firstTerm)}, so there is nothing to add for{" "}
          {props.termLabel}. You can plan your first semester on the Plan page later.
        </p>
        <StepActions step="classes" hideSkip primary={<ContinueLink step="classes" />} />
      </div>
    );
  }

  function report(text: string, list: PlanWarning[] = []) {
    setError(null);
    setMessage(text);
    setWarnings(list);
  }

  async function choose(course: Pick<Course, "code" | "sections">, section: Section) {
    const action = classAction(plan.items, term, course.code, section.crossListings, section.crn);
    const label = `${course.code} ${section.section} (CRN ${section.crn})`;
    if (action.kind === "none") {
      report(`${label} is already in your ${props.termLabel} classes.`);
      setPicker(null);
      return;
    }
    const result =
      action.kind === "add"
        ? await plan.add(course.code, classAddBody(term, course.code, section.crn, status))
        : await plan.setCrn(course.code, action.itemId, section.crn);
    if (!result) return;
    if (result.ok) {
      report(
        action.kind === "add"
          ? `Added ${label} to your ${props.termLabel} classes.`
          : `${course.code} is now section ${section.section} (CRN ${section.crn}).`,
        result.warnings,
      );
      setPicker(null);
    } else if (result.failure.conflict) {
      report(`${course.code} is already in your ${props.termLabel} classes.`);
      setPicker(null);
    } else {
      setMessage("");
      setWarnings([]);
      setError(result.failure.message);
    }
  }

  async function open(summary: CourseSummary) {
    setError(null);
    setPicker({ code: summary.code, course: null, loading: true, error: null, crn: "" });
    try {
      const { course } = await callApi(catalogApi.course, {
        params: { term, code: courseSlug(summary.code) },
      });
      const only = autoSection(course);
      if (only) {
        setPicker(null);
        await choose(course, only);
        return;
      }
      const existing = findActiveItem(plan.items, term, course.code, summary.crossListings);
      setPicker({
        code: summary.code,
        course,
        loading: false,
        error: null,
        crn: existing?.crn ?? "",
      });
    } catch (caught) {
      setPicker({
        code: summary.code,
        course: null,
        loading: false,
        error: describeFailure(caught).message,
        crn: "",
      });
    }
  }

  function renderResult(summary: CourseSummary) {
    const existing = findActiveItem(plan.items, term, summary.code, summary.crossListings);
    const isOpen = picker?.code === summary.code;
    const single = summary.sectionCount === 1;
    const busy = plan.busy === summary.code || (isOpen && picker?.loading);
    const action = single
      ? existing
        ? "Use its only section"
        : "Add"
      : existing?.crn
        ? "Change section"
        : "Choose section";
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {existing ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <Check aria-hidden className="size-4" />
              In your classes{existing.crn ? ` (CRN ${existing.crn})` : ", no section yet"}
            </span>
          ) : null}
          {existing && existing.crn && single ? null : (
            <Button
              size="sm"
              variant={existing ? "secondary" : "primary"}
              aria-expanded={single ? undefined : isOpen}
              aria-disabled={busy || undefined}
              aria-label={`${action} for ${summary.code}`}
              onClick={() => (isOpen && !single ? setPicker(null) : void open(summary))}
            >
              {action}
            </Button>
          )}
        </div>
        {isOpen && picker && !single ? (
          <SectionPicker
            picker={picker}
            busy={plan.busy === summary.code}
            onPick={(crn) => setPicker({ ...picker, crn })}
            onCancel={() => setPicker(null)}
            onConfirm={(section) => picker.course && void choose(picker.course, section)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="classes-current" className="flex flex-col gap-2">
        <h2 id="classes-current" className="text-base font-strong text-fg">
          In your plan for {props.termLabel}
        </h2>
        {current.length === 0 ? (
          <p className="text-sm text-fg-2">No classes yet. Search for each class you are taking.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="current-classes">
            {current.map((item) => (
              <PlanItemRow
                key={item.id}
                item={item}
                detail={item.crn ? `CRN ${item.crn}` : "No section chosen"}
                removing={plan.busy === `remove-${item.id}`}
                onRemove={async () => {
                  const result = await plan.remove(`remove-${item.id}`, item.id);
                  if (result?.ok) report(`Removed ${item.courseCode}.`);
                  else if (result) setError(result.failure.message);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {error ? <FormAlert>{error}</FormAlert> : null}
      <StatusLine message={message} warnings={warnings} testId="classes-status" />

      <CourseSearch
        term={term}
        label={`Search ${props.termLabel} courses`}
        renderResult={renderResult}
        testId="classes-search"
      />

      <StepActions step="classes" primary={<ContinueLink step="classes" />} />
    </div>
  );
}

function SectionPicker({
  picker,
  busy,
  onPick,
  onCancel,
  onConfirm,
}: {
  picker: Picker;
  busy: boolean;
  onPick: (crn: string) => void;
  onCancel: () => void;
  onConfirm: (section: Section) => void;
}) {
  if (picker.loading) return <p className="text-sm text-fg-2">Loading sections…</p>;
  if (picker.error || !picker.course) {
    return <FormAlert>{picker.error ?? "Could not load the sections."}</FormAlert>;
  }
  const course = picker.course;
  const chosen = course.sections.find((section) => section.crn === picker.crn);
  const groupName = `sections-${courseSlug(course.code)}`;
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-semibold text-fg">Your section of {course.code}</legend>
      {course.sections.map((section) => {
        const id = `${groupName}-${section.crn}`;
        return (
          <div key={section.crn} className="flex items-start gap-2.5">
            <input
              type="radio"
              id={id}
              name={groupName}
              value={section.crn}
              checked={picker.crn === section.crn}
              onChange={() => onPick(section.crn)}
              className="mt-1 size-5 shrink-0 accent-primary-fill md:size-4"
            />
            <label htmlFor={id} className="flex min-w-0 flex-col text-sm">
              <span className="font-semibold text-fg">
                <CourseCode code={course.code} section={section.section} /> · CRN {section.crn}
                {section.title !== course.title ? ` · ${section.title}` : ""}
              </span>
              <span className="text-fg-2">
                {section.meetings.length > 0
                  ? section.meetings.map(meetingLabel).join("; ")
                  : "Time TBA"}
              </span>
              <span className="text-fg-2">{instructorLabel(section.instructors)}</span>
            </label>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          aria-disabled={!chosen || busy || undefined}
          onClick={() => chosen && onConfirm(chosen)}
        >
          {busy ? "Saving…" : "Save section"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}
