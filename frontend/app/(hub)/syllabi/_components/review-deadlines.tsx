"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { notify } from "@/components/ui/notify";
import { callApi } from "@/lib/api/client";
import { syllabiEndpoints } from "@/lib/api/endpoints";
import type { ExtractedDeadline } from "@/lib/types/syllabus";
import { useSyllabusAction } from "./use-syllabus-action";

interface Draft extends ExtractedDeadline {
  kept: boolean;
}

export interface ReviewDeadlinesProps {
  syllabusId: string;
  courseCode: string;
  deadlines: readonly ExtractedDeadline[];
  onDone: () => void;
}

/**
 * Review-before-save (PLAN-UX §3): the deadlines a syllabus upload just extracted (or an earlier upload's,
 * reopened from the list), one row per deadline with a checkbox, an editable title and an editable date.
 * "Add to plan" sends only the kept rows to POST /api/syllabi/[id]/deadlines, which stores them as plan
 * deadlines (origin "syllabus"); nothing reaches the plan until this step.
 */
export function ReviewDeadlines({
  syllabusId,
  courseCode,
  deadlines,
  onDone,
}: ReviewDeadlinesProps) {
  const [drafts, setDrafts] = React.useState<Draft[]>(deadlines.map((d) => ({ ...d, kept: true })));
  const action = useSyllabusAction();
  const keptCount = drafts.filter((d) => d.kept).length;

  const set = (index: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const remove = (index: number) => setDrafts((prev) => prev.filter((_, i) => i !== index));

  if (deadlines.length === 0) {
    return (
      <Notice tone="info" data-testid="review-empty">
        MakeItSo did not find any deadlines with a date in that syllabus. You can still add them by
        hand on /plan.
      </Notice>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const chosen = drafts.filter((d) => d.kept);
    if (chosen.length === 0) {
      action.setError("Keep at least one deadline, or close this without adding any.");
      return;
    }
    const result = await action.run(
      () =>
        callApi(syllabiEndpoints.saveDeadlines, {
          params: { id: syllabusId },
          body: { deadlines: chosen.map(({ title, dueAt }) => ({ title, dueAt })) },
        }),
      { fallback: "Could not save those deadlines. Please try again." },
    );
    if (result.ok) {
      notify.success(
        `Added ${result.value.deadlines.length} ${result.value.deadlines.length === 1 ? "deadline" : "deadlines"} to your plan.`,
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
      <ul className="flex flex-col gap-2" aria-label="Extracted deadlines">
        {drafts.map((draft, index) => {
          const rowId = `syllabus-deadline-${syllabusId}-${index}`;
          return (
            <li
              key={rowId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3"
              data-testid="syllabus-deadline-row"
            >
              <Checkbox
                id={`${rowId}-kept`}
                checked={draft.kept}
                onCheckedChange={(checked) => set(index, { kept: checked === true })}
              />
              <Label htmlFor={`${rowId}-kept`} className="sr-only">
                Keep this deadline
              </Label>
              <Field id={`${rowId}-title`} label="Title" className="min-w-0 flex-1">
                <Input
                  value={draft.title}
                  maxLength={120}
                  disabled={!draft.kept}
                  onChange={(event) => set(index, { title: event.target.value })}
                />
              </Field>
              <Field id={`${rowId}-date`} label="Due" className="w-40 shrink-0">
                <Input
                  type="date"
                  value={draft.dueAt}
                  disabled={!draft.kept}
                  onChange={(event) => set(index, { dueAt: event.target.value })}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => remove(index)}
              >
                <X aria-hidden />
                Remove <span className="sr-only">{draft.title}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={action.busy || keptCount === 0}>
          <Plus aria-hidden />
          Add {keptCount} {keptCount === 1 ? "deadline" : "deadlines"} to plan
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
