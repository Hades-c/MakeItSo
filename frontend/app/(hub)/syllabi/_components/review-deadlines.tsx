"use client";

import * as React from "react";
import { CalendarX2, Plus, X } from "lucide-react";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { notify } from "@/components/ui/notify";
import { callApi } from "@/lib/api/client";
import { syllabiEndpoints } from "@/lib/api/endpoints";
import { formatShortDate } from "@/lib/format";
import type { ExtractedDeadline } from "@/lib/types/syllabus";
import { useSyllabusAction } from "./use-syllabus-action";

/** The syllabus's term with its first and last day, when the term list gives them. */
export interface ReviewTerm {
  label: string;
  start?: string | null;
  end?: string | null;
}

export interface ReviewDeadlinesProps {
  syllabusId: string;
  courseCode: string;
  deadlines: readonly ExtractedDeadline[];
  term?: ReviewTerm | null;
  onDone: () => void;
}

/** "Sep 30" for a "YYYY-MM-DD" day, with no time zone shift. */
function dayText(day: string): string {
  return formatShortDate(`${day}T12:00:00Z`, "UTC");
}

/** Why a date needs a second look: it falls outside the term (when its days are known). */
function outsideTerm(dueAt: string, term: ReviewTerm | null | undefined): string | null {
  if (!term?.start || !term.end || !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) return null;
  if (dueAt >= term.start && dueAt <= term.end) return null;
  return `Outside ${term.label} (${dayText(term.start)} – ${dayText(term.end)}): check this date.`;
}

/**
 * Review-before-save (PLAN-UX §3): the deadlines MakeItSo's AI found in a pasted syllabus (or an earlier one's,
 * reopened from the list), marked as AI output, one row per deadline with an editable title and date and a
 * Remove button; a date outside the syllabus's term says so. "Add to plan" sends the rows still listed to
 * POST /api/syllabi/[id]/deadlines, which stores them as plan deadlines (origin "syllabus"); nothing reaches the
 * plan until this step, and saving the same rows again adds nothing twice.
 */
export function ReviewDeadlines({
  syllabusId,
  courseCode,
  deadlines,
  term = null,
  onDone,
}: ReviewDeadlinesProps) {
  const [drafts, setDrafts] = React.useState<ExtractedDeadline[]>(() => [...deadlines]);
  const action = useSyllabusAction();
  const count = drafts.length;

  const set = (index: number, patch: Partial<ExtractedDeadline>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const remove = (index: number) => setDrafts((prev) => prev.filter((_, i) => i !== index));

  if (deadlines.length === 0) {
    return (
      <Notice tone="info" data-testid="review-empty">
        MakeItSo did not find any deadlines with a date in that text. Paste the part of the syllabus
        with the schedule, or check that it gives the dates as days (&quot;October 15&quot;).
      </Notice>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (drafts.length === 0) {
      action.setError("Every deadline was removed. Close this, or paste the syllabus again.");
      return;
    }
    const result = await action.run(
      () =>
        callApi(syllabiEndpoints.saveDeadlines, {
          params: { id: syllabusId },
          body: { deadlines: drafts.map(({ title, dueAt }) => ({ title, dueAt })) },
        }),
      { fallback: "Could not save those deadlines. Please try again." },
    );
    if (result.ok) {
      const { added, deadlines: saved } = result.value;
      const already = saved.length - added;
      const noun = (n: number) => (n === 1 ? "deadline" : "deadlines");
      notify.success(
        added === 0
          ? `${saved.length === 1 ? "That deadline is" : "Those deadlines are"} already in your plan.`
          : `Added ${added} ${noun(added)} to your plan${already > 0 ? ` (${already} already there)` : ""}.`,
      );
      onDone();
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3"
      aria-label={`Review deadlines for ${courseCode}`}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
        <AiChip label="check each date against your syllabus" />
        Edit or remove any that are wrong before adding them.
      </p>
      <ul className="flex flex-col gap-2" aria-label="Deadlines found">
        {drafts.map((draft, index) => {
          const rowId = `syllabus-deadline-${syllabusId}-${index}`;
          const flag = outsideTerm(draft.dueAt, term);
          return (
            <li
              key={rowId}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3"
              data-testid="syllabus-deadline-row"
              data-outside-term={flag ? "true" : undefined}
            >
              <Field id={`${rowId}-title`} label="Title" className="min-w-0 sm:flex-1">
                <Input
                  value={draft.title}
                  maxLength={120}
                  onChange={(event) => set(index, { title: event.target.value })}
                />
              </Field>
              <Field id={`${rowId}-date`} label="Due" className="sm:w-44 sm:shrink-0">
                <Input
                  type="date"
                  value={draft.dueAt}
                  onChange={(event) => set(index, { dueAt: event.target.value })}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start sm:self-end"
                onClick={() => remove(index)}
              >
                <X aria-hidden />
                Remove <span className="sr-only">{draft.title}</span>
              </Button>
              {flag ? (
                <p className="flex items-start gap-1.5 text-xs font-medium text-fg sm:basis-full">
                  <CalendarX2 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  {flag}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={action.busy || count === 0}>
          <Plus aria-hidden />
          Add {count} {count === 1 ? "deadline" : "deadlines"} to plan
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={action.busy}>
          Close without adding
        </Button>
      </div>
      <Notice tone="error" role="alert">
        {action.error}
      </Notice>
    </form>
  );
}
