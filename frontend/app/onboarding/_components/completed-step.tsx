"use client";

import { useId, useState } from "react";
import { Check, Plus } from "lucide-react";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { termLabel, type TermCode } from "@/lib/term";
import type { CourseSummary } from "@/lib/types/catalog";
import type { PlanItem, PlanWarning } from "@/lib/types/plan";
import { issueFor } from "../_lib/errors";
import {
  completedAddBody,
  completedItems,
  findActiveItem,
  MANUAL_KIND_LABELS,
  MANUAL_KINDS,
  manualAddBody,
  ManualEntrySchema,
  type ManualKind,
} from "../_lib/plan-items";
import { CourseSearch } from "./course-search";
import { ContinueLink, NativeSelect, PlanItemRow, StatusLine, StepActions } from "./parts";
import { usePlanItems } from "./use-plan-items";

/**
 * Step 3, completed courses: pick a past term (first term → the term before the current one), search its schedule
 * and mark courses completed; or add a manual entry (AP/IB or transfer credit, which may have no term, or a
 * Davidson course the search does not find, saved as unverified). A course already completed in that term is
 * shown as such instead of being added again; the server's (termCode, canonicalCode) key backs that up (409).
 */

export interface CompletedStepProps {
  /** Newest first; empty in the first semester. */
  terms: TermCode[];
  items: PlanItem[];
}

export function CompletedStep({ terms, items }: CompletedStepProps) {
  const plan = usePlanItems(items);
  const [term, setTerm] = useState<TermCode | null>(terms[0] ?? null);
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<PlanWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const termSelectId = useId();
  const done = completedItems(plan.items);

  function report(text: string, list: PlanWarning[] = []) {
    setError(null);
    setMessage(text);
    setWarnings(list);
  }

  async function markCompleted(termCode: TermCode, course: CourseSummary) {
    const result = await plan.add(course.code, completedAddBody(termCode, course.code));
    if (!result) return;
    if (result.ok) {
      report(`Added ${course.code} (${termLabel(termCode)}) as completed.`, result.warnings);
    } else if (result.failure.conflict) {
      report(`${course.code} is already in your ${termLabel(termCode)} plan.`);
    } else {
      setMessage("");
      setWarnings([]);
      setError(result.failure.message);
    }
  }

  function renderResult(course: CourseSummary) {
    if (!term) return null;
    const existing = findActiveItem(plan.items, term, course.code, course.crossListings);
    if (existing) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <Check aria-hidden className="size-4" />
          {existing.status === "completed"
            ? `Completed in ${termLabel(term)}`
            : `In your ${termLabel(term)} plan`}
        </span>
      );
    }
    return (
      <div>
        <Button
          size="sm"
          aria-disabled={plan.busy === course.code || undefined}
          onClick={() => void markCompleted(term, course)}
        >
          Mark completed<span className="sr-only">: {course.code}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="completed-list" className="flex flex-col gap-2">
        <h2 id="completed-list" className="text-base font-strong text-fg">
          Completed so far
        </h2>
        {done.length === 0 ? (
          <p className="text-sm text-fg-2">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="completed-items">
            {done.map((item) => (
              <PlanItemRow
                key={item.id}
                item={item}
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
      <StatusLine message={message} warnings={warnings} testId="completed-status" />

      {term ? (
        <section aria-labelledby="completed-search" className="flex flex-col gap-3">
          <h2 id="completed-search" className="text-base font-strong text-fg">
            Find a Davidson course
          </h2>
          <div className="flex max-w-xs flex-col gap-1.5">
            <label htmlFor={termSelectId} className="text-sm font-semibold text-fg">
              Term you took it
            </label>
            <NativeSelect
              id={termSelectId}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            >
              {terms.map((code) => (
                <option key={code} value={code}>
                  {termLabel(code)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <CourseSearch
            key={term}
            term={term}
            label={`Search ${termLabel(term)} courses`}
            renderResult={renderResult}
            testId="completed-search-box"
          />
        </section>
      ) : (
        <p className="text-sm text-fg-2">
          This is your first semester, so there are no Davidson courses to add yet. AP, IB and
          transfer credit go below.
        </p>
      )}

      <ManualEntryForm
        terms={terms}
        busy={plan.busy === "manual"}
        onAdd={async (body, label) => {
          const result = await plan.add("manual", body);
          if (!result) return false;
          if (result.ok) {
            report(`Added ${label}.`, result.warnings);
            return true;
          }
          if (result.failure.conflict) {
            report(`${label} is already in your plan.`);
            return true;
          }
          setMessage("");
          setWarnings([]);
          setError(result.failure.message);
          return false;
        }}
        isListed={(termCode, code) => Boolean(findActiveItem(plan.items, termCode, code))}
      />

      <StepActions step="completed" primary={<ContinueLink step="completed" />} />
    </div>
  );
}

function ManualEntryForm({
  terms,
  busy,
  onAdd,
  isListed,
}: {
  terms: readonly TermCode[];
  busy: boolean;
  onAdd: (body: ReturnType<typeof manualAddBody>, label: string) => Promise<boolean>;
  isListed: (termCode: TermCode | null, code: string) => boolean;
}) {
  const [kind, setKind] = useState<ManualKind>("ap");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [credits, setCredits] = useState("1");
  const [term, setTerm] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const kinds = terms.length > 0 ? MANUAL_KINDS : MANUAL_KINDS.filter((k) => k !== "manual");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = ManualEntrySchema.safeParse({
      kind,
      courseCode: code,
      title: title.trim() || undefined,
      credits: credits.trim() === "" ? Number.NaN : Number(credits),
      termCode: term || null,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message:
          issue.path[0] === "courseCode"
            ? "Enter a course code such as MAT 113."
            : issue.path[0] === "credits"
              ? "Credits run from 0 to 4."
              : issue.message,
      }));
      setErrors({
        courseCode: issueFor(issues, "courseCode"),
        credits: issueFor(issues, "credits"),
        termCode: issueFor(issues, "termCode"),
      });
      return;
    }
    setErrors({});
    const entry = parsed.data;
    const label = `${entry.courseCode} (${MANUAL_KIND_LABELS[entry.kind]}${entry.termCode ? `, ${termLabel(entry.termCode)}` : ""})`;
    if (isListed(entry.termCode, entry.courseCode)) {
      setErrors({ courseCode: `${entry.courseCode} is already listed for that term.` });
      return;
    }
    if (await onAdd(manualAddBody(entry), label)) {
      setCode("");
      setTitle("");
      setCredits("1");
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="manual-entry-title"
      className="flex flex-col gap-4 rounded-lg border border-line p-4"
    >
      <h2 id="manual-entry-title" className="text-base font-strong text-fg">
        Add AP, IB or transfer credit
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="manual-kind" label="Kind of credit">
          <NativeSelect
            value={kind}
            onChange={(event) => setKind(event.target.value as ManualKind)}
          >
            {kinds.map((value) => (
              <option key={value} value={value}>
                {MANUAL_KIND_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="manual-term"
          label="Term"
          hint={kind === "manual" ? "When you took it." : "Leave as “Before Davidson” for AP/IB."}
          error={errors.termCode}
        >
          <NativeSelect value={term} onChange={(event) => setTerm(event.target.value)}>
            <option value="">{kind === "manual" ? "Choose a term…" : "Before Davidson"}</option>
            {terms.map((code) => (
              <option key={code} value={code}>
                {termLabel(code)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="manual-code"
          label="Davidson course code"
          hint="The Davidson equivalent, e.g. MAT 113."
          error={errors.courseCode}
        >
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={20}
            className="h-11 px-3 md:h-10"
          />
        </Field>
        <Field id="manual-credits" label="Credits" error={errors.credits}>
          <Input
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            inputMode="decimal"
            maxLength={4}
            className="h-11 px-3 md:h-10"
          />
        </Field>
        <Field
          id="manual-title"
          label="Title (optional)"
          hint="Used only when the code is not in the Davidson course data."
          className="sm:col-span-2"
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            className="h-11 px-3 md:h-10"
          />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="secondary" aria-disabled={busy || undefined}>
          <Plus aria-hidden />
          {busy ? "Adding…" : "Add credit"}
        </Button>
      </div>
    </form>
  );
}
