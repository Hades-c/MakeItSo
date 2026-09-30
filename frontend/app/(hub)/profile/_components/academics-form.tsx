"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  FieldErrorSummary,
  useFocusFirstInvalid,
  type FieldSpecs,
} from "@/app/(auth)/_components/field-errors";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callApi } from "@/lib/api/client";
import { profileApi, type Profile } from "@/lib/api/profile";
import { termLabel, type ClassStanding } from "@/lib/term";
import { describeFailure } from "../_lib/errors";
import {
  cleanNames,
  defaultFirstTermFor,
  derivedStanding,
  fieldErrorsFromIssues,
  firstTermFits,
  firstTermOptions,
  graduationYearOptions,
  STANDING_CHOICES,
  STANDING_LABELS,
  standingSummary,
} from "../_lib/options";

/**
 * Majors, minors (official Acalog names, up to three each), graduation year, first term at Davidson and the class
 * standing (derived from the graduation year with lib/term classStanding, or set by the student). One Save sends
 * every field; clearing is explicit ("Not set", "From my graduation year", removing every major). Server field
 * errors land on their fields, are summarised in a role=alert box and focus moves to the first one.
 */

type AcademicsField = "majors" | "minors" | "graduationYear" | "firstTerm" | "standingOverride";

const FIELDS: FieldSpecs<AcademicsField> = {
  majors: { id: "profile-majors", label: "Majors" },
  minors: { id: "profile-minors", label: "Minors" },
  graduationYear: { id: "profile-graduation-year", label: "Graduation year" },
  firstTerm: { id: "profile-first-term", label: "First term at Davidson" },
  standingOverride: { id: "profile-standing", label: "Class standing" },
};
const FIELD_NAMES = Object.keys(FIELDS) as AcademicsField[];

const MAX_PROGRAMS = 3;
const NOT_SET = "not-set";
const AUTO = "auto";

type AcademicsValues = Pick<
  Profile,
  "majors" | "minors" | "graduationYear" | "firstTerm" | "standingOverride"
>;

export interface AcademicsFormProps {
  initial: AcademicsValues;
  /** Official names (lib/api/profile: majors/minors must be official). */
  majorNames: readonly string[];
  minorNames: readonly string[];
  /** Server now (ISO): year choices and the derived standing. */
  now: string;
}

function sameValues(a: AcademicsValues, b: AcademicsValues): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function AcademicsForm({ initial, majorNames, minorNames, now }: AcademicsFormProps) {
  const [saved, setSaved] = useState<AcademicsValues>(initial);
  // Rows may be "" while a newly added row has no choice yet.
  const [majors, setMajors] = useState<string[]>(initial.majors);
  const [minors, setMinors] = useState<string[]>(initial.minors);
  const [graduationYear, setGraduationYear] = useState(initial.graduationYear);
  const [firstTerm, setFirstTerm] = useState(initial.firstTerm);
  const [standingOverride, setStandingOverride] = useState<ClassStanding | null>(
    initial.standingOverride,
  );
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AcademicsField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useFocusFirstInvalid(fieldErrors, FIELDS);

  const values: AcademicsValues = {
    majors: cleanNames(majors),
    minors: cleanNames(minors),
    graduationYear,
    firstTerm,
    standingOverride,
  };
  const dirty = !sameValues(values, saved);
  const standing = derivedStanding(graduationYear, now, standingOverride);
  const years = graduationYearOptions(now, saved.graduationYear);
  const terms = firstTermOptions(graduationYear, firstTerm);
  // A first term that no longer fits the chosen year stays visible (Save then explains the problem).
  if (firstTerm && !terms.some((term) => term.code === firstTerm)) {
    terms.push({ code: firstTerm, label: termLabel(firstTerm) });
  }

  function edited() {
    setStatus("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("");
    if (firstTerm && !firstTermFits(firstTerm, graduationYear)) {
      setFieldErrors({ firstTerm: "The first term and the graduation year do not fit together." });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const { profile } = await callApi(profileApi.update, { body: values });
      const next: AcademicsValues = {
        majors: profile.majors,
        minors: profile.minors,
        graduationYear: profile.graduationYear,
        firstTerm: profile.firstTerm,
        standingOverride: profile.standingOverride,
      };
      setSaved(next);
      setMajors(next.majors);
      setMinors(next.minors);
      setGraduationYear(next.graduationYear);
      setFirstTerm(next.firstTerm);
      setStandingOverride(next.standingOverride);
      setStatus("Academics saved.");
    } catch (caught) {
      const failure = describeFailure(caught);
      const errors = fieldErrorsFromIssues(failure.issues, FIELD_NAMES);
      setFieldErrors(errors);
      setError(Object.keys(errors).length > 0 ? null : failure.message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FieldErrorSummary errors={fieldErrors} fields={FIELDS} />
      {error ? <FormAlert>{error}</FormAlert> : null}

      <ProgramRows
        field="majors"
        noun="major"
        rows={majors}
        options={majorNames}
        error={fieldErrors.majors}
        onChange={(rows) => {
          setMajors(rows);
          edited();
        }}
      />
      <ProgramRows
        field="minors"
        noun="minor"
        rows={minors}
        options={minorNames}
        error={fieldErrors.minors}
        onChange={(rows) => {
          setMinors(rows);
          edited();
        }}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id={FIELDS.graduationYear.id}
          label="Graduation year"
          error={fieldErrors.graduationYear}
        >
          <SelectTriggerFor
            value={String(graduationYear)}
            onValueChange={(value) => {
              setGraduationYear(Number(value));
              edited();
            }}
            items={years.map((year) => ({ value: String(year), label: `Class of ${year}` }))}
          />
        </Field>
        <Field
          id={FIELDS.firstTerm.id}
          label="First term at Davidson"
          hint={
            firstTerm
              ? undefined
              : `Not set: MakeItSo assumes ${termLabel(defaultFirstTermFor(graduationYear))}.`
          }
          error={fieldErrors.firstTerm}
        >
          <SelectTriggerFor
            value={firstTerm ?? NOT_SET}
            onValueChange={(value) => {
              setFirstTerm(value === NOT_SET ? null : value);
              edited();
            }}
            items={[
              { value: NOT_SET, label: "Not set" },
              ...terms.map((term) => ({ value: term.code, label: term.label })),
            ]}
          />
        </Field>
      </div>

      <Field
        id={FIELDS.standingOverride.id}
        label="Class standing"
        hint={`Now: ${standingSummary(standing)}. Your real standing depends on credits: set it here if the year guess is wrong.`}
        error={fieldErrors.standingOverride}
      >
        <SelectTriggerFor
          value={standingOverride ?? AUTO}
          onValueChange={(value) => {
            setStandingOverride(value === AUTO ? null : (value as ClassStanding));
            edited();
          }}
          items={[
            {
              value: AUTO,
              label: `From my graduation year (${STANDING_LABELS[derivedStanding(graduationYear, now, null).standing]})`,
            },
            ...STANDING_CHOICES.map((choice) => ({
              value: choice,
              label: STANDING_LABELS[choice],
            })),
          ]}
        />
      </Field>

      <div className="flex flex-col gap-2 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
        <p role="status" className="text-sm font-medium text-success">
          {status}
        </p>
        <Button type="submit" disabled={saving || !dirty} className="md:ml-auto">
          {saving ? "Saving…" : "Save academics"}
        </Button>
      </div>
    </form>
  );
}

interface SelectItemSpec {
  value: string;
  label: string;
}

/**
 * A Lakeside Select whose trigger takes the id/aria props <Field> puts on its child, so the label, hint and error
 * are wired to the trigger, and which shows its current choice in the server-rendered HTML.
 */
function SelectTriggerFor({
  value,
  onValueChange,
  items,
  placeholder,
  ...triggerProps
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly SelectItemSpec[];
  placeholder?: string;
} & React.ComponentPropsWithoutRef<typeof SelectTrigger>) {
  // Radix fills SelectValue in only after hydration; giving it the label renders the choice on the server too.
  const selected = items.find((item) => item.value === value)?.label;
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger {...triggerProps}>
        <SelectValue placeholder={placeholder}>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProgramRows({
  field,
  noun,
  rows,
  options,
  error,
  onChange,
}: {
  field: "majors" | "minors";
  noun: string;
  rows: readonly string[];
  options: readonly string[];
  error?: string;
  onChange: (rows: string[]) => void;
}) {
  const id = FIELDS[field].id;
  const label = FIELDS[field].label;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-describedby={errorId}
      className="flex flex-col gap-2 rounded-md outline-none"
    >
      <legend className="mb-1.5 text-sm font-semibold text-fg">{label}</legend>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-3">No {noun} chosen.</p>
      ) : (
        rows.map((row, index) => {
          const taken = rows.filter((other, i) => i !== index && other);
          // A stored name the catalog no longer lists stays selectable for its own row.
          const choices = [
            ...(row && !options.includes(row) ? [row] : []),
            ...options.filter((name) => !taken.includes(name)),
          ];
          const rowId = `${id}-${index}`;
          const rowLabel = `${noun[0]?.toUpperCase()}${noun.slice(1)} ${index + 1}`;
          return (
            <div key={index} className="flex items-center gap-2">
              <Label htmlFor={rowId} className="sr-only">
                {rowLabel}
              </Label>
              <div className="min-w-0 flex-1">
                <SelectTriggerFor
                  id={rowId}
                  aria-invalid={error ? true : undefined}
                  value={row}
                  placeholder={`Choose a ${noun}`}
                  onValueChange={(value) =>
                    onChange(rows.map((current, i) => (i === index ? value : current)))
                  }
                  items={choices.map((name) => ({ value: name, label: name }))}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${row || rowLabel.toLowerCase()}`}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <X aria-hidden />
              </Button>
            </div>
          );
        })
      )}
      {rows.length < MAX_PROGRAMS ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => onChange([...rows, ""])}>
            <Plus aria-hidden />
            Add a {noun}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-fg-3">Up to {MAX_PROGRAMS}.</p>
      )}
      {error ? (
        <p id={errorId} className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
