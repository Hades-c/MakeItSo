"use client";

import * as React from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TermAvailability = "offered" | "not-offered" | "not-yet-published";

export interface AddToPlanTerm {
  /** Term code, e.g. "202602". */
  code: string;
  /** "Spring 2027". */
  label: string;
  /** From the catalog (PLAN §5 Availability): never "offered" for an unpublished term. */
  availability: TermAvailability;
  /**
   * Short line under the term, replacing the availability word for offered and unpublished terms: "5th course",
   * "Usually offered in Fall". Not-offered terms always say "Not offered".
   */
  note?: string;
  /** Sections in that term (offered terms). */
  sectionCount?: number;
}

export interface AddToPlanControlProps {
  terms: readonly AddToPlanTerm[];
  /** Selected term code (controlled). */
  value: string | null;
  onChange: (termCode: string) => void;
  /** Called with the selected term when the student presses "Add to …". */
  onAdd: (termCode: string) => void;
  /** An add is in flight: the button says so and ignores presses. */
  pending: boolean;
  /** The course is already in the plan for the selected term. */
  added?: boolean;
  /** Course being added, e.g. "HIS 357" (used in the explanations). */
  courseCode?: string;
  /** Shown between the term choice and the button, e.g. a compact PlanMap preview. */
  children?: React.ReactNode;
  className?: string;
}

function sections(n: number): string {
  return n === 1 ? "1 section" : `${n} sections`;
}

function shortAvailability(term: AddToPlanTerm): string {
  if (term.availability === "not-offered") return "Not offered";
  if (term.note) return term.note;
  if (term.availability === "not-yet-published") return "Not yet published";
  return term.sectionCount ? sections(term.sectionCount) : "Offered";
}

function explanation(term: AddToPlanTerm, course: string): string {
  switch (term.availability) {
    case "offered":
      return term.sectionCount
        ? `Offered in ${term.label} · ${sections(term.sectionCount)}.`
        : `Offered in ${term.label}.`;
    case "not-yet-published":
      return `The ${term.label} schedule isn’t published yet — we’ll flag it if ${course} isn’t offered.`;
    case "not-offered":
      return `${capitalise(course)} isn’t on the ${term.label} schedule, so it can’t be added to that term.`;
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Add to plan": a segmented term choice (a native radio group, so arrow keys move between terms and skip the
 * ones that cannot be chosen) and one button that adds the course to the chosen term. Every state is spelled out
 * in text: not offered, not yet published, adding, already in the plan.
 */
export function AddToPlanControl({
  terms,
  value,
  onChange,
  onAdd,
  pending,
  added = false,
  courseCode,
  children,
  className,
}: AddToPlanControlProps) {
  const id = React.useId();
  const course = courseCode ?? "this course";
  const selected = terms.find((t) => t.code === value) ?? null;
  const notOffered = terms.filter((t) => t.availability === "not-offered");
  const blocked = !selected || selected.availability === "not-offered";
  const inactive = pending || added || blocked;

  let buttonText: React.ReactNode;
  if (!selected) buttonText = "Choose a term";
  else if (selected.availability === "not-offered") buttonText = `Not offered in ${selected.label}`;
  else if (pending) buttonText = `Adding to ${selected.label}…`;
  else if (added) buttonText = `In your plan for ${selected.label}`;
  else buttonText = `Add to ${selected.label}`;

  const icon = pending ? (
    <LoaderCircle aria-hidden className="animate-spin" />
  ) : added ? (
    <Check aria-hidden />
  ) : blocked ? null : (
    <Plus aria-hidden />
  );

  const columns = Math.min(Math.max(terms.length, 1), 3);

  return (
    <div className={className} data-testid="add-to-plan">
      <fieldset>
        <legend className="sr-only">Term to add {course} to</legend>
        <div
          className="grid gap-1.5 rounded-lg border border-line-strong bg-surface-2 p-1"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {terms.map((term) => {
            const disabled = term.availability === "not-offered";
            const checked = term.code === value;
            const subId = `${id}-${term.code}-sub`;
            const nameId = `${id}-${term.code}-name`;
            return (
              <label
                key={term.code}
                data-availability={term.availability}
                className={cn(
                  "relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1.5 pt-2 pb-1.75 text-center",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                  checked
                    ? "bg-surface text-fg shadow-card ring-[1.5px] ring-primary-fill"
                    : "text-fg-2",
                  disabled
                    ? "cursor-not-allowed"
                    : !checked && "cursor-pointer transition-colors hover:bg-surface",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-term`}
                  value={term.code}
                  checked={checked}
                  disabled={disabled}
                  aria-labelledby={nameId}
                  aria-describedby={subId}
                  onChange={() => onChange(term.code)}
                  className="peer sr-only"
                />
                <span
                  id={nameId}
                  className={cn(
                    "text-sm leading-5 font-semibold",
                    disabled && "text-fg-3 line-through decoration-1",
                  )}
                >
                  {term.label}
                </span>
                <span id={subId} className="text-xs leading-4 text-fg-3">
                  {shortAvailability(term)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {notOffered.length > 0 ? (
        <p className="mt-2 text-xs text-fg-3">
          Not on the published schedule for {notOffered.map((t) => t.label).join(" or ")}.
        </p>
      ) : null}

      {children ? <div className="mt-3.5">{children}</div> : null}

      <Button
        size="lg"
        variant={added ? "secondary" : "primary"}
        className="mt-3.5 w-full"
        aria-disabled={inactive || undefined}
        aria-busy={pending || undefined}
        onClick={() => {
          if (!inactive && selected) onAdd(selected.code);
        }}
      >
        {icon}
        {buttonText}
      </Button>

      {selected ? (
        <p className="mt-3 text-sm text-fg-2" data-testid="add-to-plan-explanation">
          {explanation(selected, course)}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {pending && selected ? `Adding ${course} to ${selected.label}` : null}
        {added && selected && !pending
          ? `${capitalise(course)} is in your plan for ${selected.label}`
          : null}
      </p>
    </div>
  );
}
