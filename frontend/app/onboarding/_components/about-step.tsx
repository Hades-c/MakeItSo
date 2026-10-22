"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { callApi } from "@/lib/api/client";
import { profileApi } from "@/lib/api/profile";
import { termLabel, type TermCode } from "@/lib/term";
import {
  aboutPatch,
  aboutProblem,
  defaultFirstTerm,
  firstTermAfterYearChange,
  firstTermOptions,
  graduationYearOptions,
  isRetiredProgram,
  MAX_PROGRAMS,
  UNDECIDED,
  type AboutProblem,
} from "../_lib/academics";
import { describeFailure, issueFor } from "../_lib/errors";
import { nextStep, stepHref } from "../_lib/steps";
import { NativeSelect, StepActions, useFocusRequest, useSetupNext } from "./parts";

/**
 * Step 1: graduation year, first term at Davidson (default Fall of graduationYear − 4, following the year until
 * the student picks a term themselves), and majors/minors from the official Acalog names. The first major row
 * offers "Undecided" (UI only: it saves `majors: []`). "Save and continue" sends PATCH /api/profile, then moves
 * to step 2; "Skip this step" moves on without saving.
 *
 * A stored major or minor the catalog no longer lists stays visible as "(no longer offered)" and must be replaced
 * or removed before saving. Any error (before or after saving) is announced in one alert and focuses the first
 * invalid field.
 */

type AboutField = AboutProblem["field"] | "graduationYear";

/** The control a field's error belongs to (a major/minor row by index). */
function fieldControlId(field: AboutField, index = 0): string {
  switch (field) {
    case "graduationYear":
      return "onboarding-graduation-year";
    case "firstTerm":
      return "onboarding-first-term";
    case "majors":
      return `onboarding-major-${index}`;
    case "minors":
      return `onboarding-minor-${index}`;
  }
}

const FIELD_ORDER: readonly AboutField[] = ["graduationYear", "firstTerm", "majors", "minors"];

function rowIndex(path: string | undefined): number {
  const index = Number(path?.split(".")[1]);
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

export interface AboutStepProps {
  initial: {
    graduationYear: number;
    firstTerm: TermCode | null;
    majors: string[];
    minors: string[];
  };
  majorNames: readonly string[];
  minorNames: readonly string[];
  now: string;
}

interface Row {
  key: number;
  value: string;
}

function rows(values: readonly string[], fallback: string[]): Row[] {
  const list = values.length > 0 ? values : fallback;
  return list.map((value, key) => ({ key, value }));
}

export function AboutStep({ initial, majorNames, minorNames, now }: AboutStepProps) {
  const router = useRouter();
  const after = useSetupNext();
  const [graduationYear, setGraduationYear] = useState(initial.graduationYear);
  const [firstTerm, setFirstTerm] = useState<TermCode>(
    initial.firstTerm ?? defaultFirstTerm(initial.graduationYear),
  );
  // A stored first term counts as the student's own choice.
  const [pickedTerm, setPickedTerm] = useState(initial.firstTerm !== null);
  const [majors, setMajors] = useState<Row[]>(() => rows(initial.majors, [UNDECIDED]));
  const [minors, setMinors] = useState<Row[]>(() => rows(initial.minors, []));
  const nextKey = useRef(10);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const focus = useFocusRequest();

  const years = graduationYearOptions(now, initial.graduationYear);
  const terms = firstTermOptions(graduationYear, firstTerm);
  if (!terms.some((term) => term.code === firstTerm)) {
    terms.push({ code: firstTerm, label: termLabel(firstTerm) });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const values = {
      graduationYear,
      firstTerm,
      majors: majors.map((row) => row.value),
      minors: minors.map((row) => row.value),
    };
    const problem = aboutProblem(values, { majors: majorNames, minors: minorNames });
    if (problem) {
      setFieldErrors({ [problem.field]: problem.message });
      setError(checkFields([problem.message]));
      focus(fieldControlId(problem.field, problem.index));
      return;
    }
    setFieldErrors({});
    setError(null);
    setSaving(true);
    try {
      await callApi(profileApi.update, { body: aboutPatch(values) });
      router.push(stepHref(nextStep("about") ?? "classes", after));
    } catch (caught) {
      const failure = describeFailure(caught);
      const errors = {
        graduationYear: issueFor(failure.issues, "graduationYear"),
        firstTerm: issueFor(failure.issues, "firstTerm"),
        majors: issueFor(failure.issues, "majors"),
        minors: issueFor(failure.issues, "minors"),
      };
      setFieldErrors(errors);
      const messages = FIELD_ORDER.map((field) => errors[field]).filter(
        (message): message is string => Boolean(message),
      );
      setError(messages.length > 0 ? checkFields(messages) : failure.message);
      setSaving(false);
      const first = FIELD_ORDER.find((field) => errors[field]);
      if (first) {
        const issue = failure.issues.find(
          (item) => item.path === first || item.path.startsWith(`${first}.`),
        );
        focus(fieldControlId(first, rowIndex(issue?.path)));
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-label="About you">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="onboarding-graduation-year"
          label="Graduation year"
          error={fieldErrors.graduationYear}
        >
          <NativeSelect
            value={String(graduationYear)}
            onChange={(event) => {
              const year = Number(event.target.value);
              setGraduationYear(year);
              setFirstTerm((term) => firstTermAfterYearChange(term, year, pickedTerm));
            }}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                Class of {year}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="onboarding-first-term"
          label="First term at Davidson"
          hint="Usually the Fall four years before you graduate."
          error={fieldErrors.firstTerm}
        >
          <NativeSelect
            value={firstTerm}
            onChange={(event) => {
              setFirstTerm(event.target.value);
              setPickedTerm(true);
            }}
          >
            {terms.map((term) => (
              <option key={term.code} value={term.code}>
                {term.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <ProgramRows
        legend="Majors"
        noun="major"
        hint="Official names from the Davidson catalog. Not sure yet? Keep “Undecided”."
        rows={majors}
        options={majorNames}
        allowUndecided
        error={fieldErrors.majors}
        onChange={setMajors}
        newKey={() => nextKey.current++}
      />
      <ProgramRows
        legend="Minors"
        noun="minor"
        hint="Optional."
        rows={minors}
        options={minorNames}
        error={fieldErrors.minors}
        onChange={setMinors}
        newKey={() => nextKey.current++}
      />

      <StepActions
        step="about"
        primary={
          <Button type="submit" aria-disabled={saving || undefined}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        }
      />
    </form>
  );
}

function checkFields(messages: readonly string[]): string {
  return `Check the highlighted ${messages.length === 1 ? "field" : "fields"}: ${messages.join(" ")}`;
}

interface ProgramRowsProps {
  legend: string;
  noun: string;
  hint: string;
  rows: Row[];
  options: readonly string[];
  allowUndecided?: boolean;
  error?: string;
  onChange: (rows: Row[]) => void;
  newKey: () => number;
}

function ProgramRows({
  legend,
  noun,
  hint,
  rows: list,
  options,
  allowUndecided,
  error,
  onChange,
  newKey,
}: ProgramRowsProps) {
  const hintId = `onboarding-${noun}-hint`;
  const errorId = `onboarding-${noun}-error`;
  const chosen = list.map((row) => row.value);
  const canAdd = list.length < MAX_PROGRAMS && !chosen.includes(UNDECIDED);

  return (
    <fieldset
      className="flex flex-col gap-2.5"
      aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
    >
      <legend className="mb-1 text-sm font-semibold text-fg">{legend}</legend>
      <p id={hintId} className="-mt-1 text-xs text-fg-3">
        {hint}
      </p>
      {list.map((row, index) => {
        const id = `onboarding-${noun}-${index}`;
        const label = list.length > 1 ? `${legend.slice(0, -1)} ${index + 1}` : legend.slice(0, -1);
        return (
          <div key={row.key} className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor={id} className="sr-only">
                {label}
              </label>
              <NativeSelect
                id={id}
                value={row.value}
                aria-invalid={error ? true : undefined}
                onChange={(event) =>
                  onChange(
                    list.map((other) =>
                      other.key === row.key ? { ...other, value: event.target.value } : other,
                    ),
                  )
                }
              >
                <option value="">Choose a {noun}…</option>
                {allowUndecided && index === 0 ? (
                  <option value={UNDECIDED}>{UNDECIDED}</option>
                ) : null}
                {isRetiredProgram(row.value, options) ? (
                  <option value={row.value}>{row.value} (no longer offered)</option>
                ) : null}
                {options.map((name) => (
                  <option
                    key={name}
                    value={name}
                    disabled={name !== row.value && chosen.includes(name)}
                  >
                    {name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={() => onChange(list.filter((other) => other.key !== row.key))}
            >
              <X aria-hidden />
            </Button>
          </div>
        );
      })}
      {error ? (
        <p id={errorId} className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {canAdd ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onChange([...list, { key: newKey(), value: "" }])}
          >
            <Plus aria-hidden />
            {list.length === 0 ? `Add a ${noun}` : `Add another ${noun}`}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
