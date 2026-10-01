"use client";

import * as React from "react";
import { Pencil, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, controlClass } from "@/components/ui/input";
import { SourceTag } from "@/components/ui/source-tag";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/api/client";
import { CreateSummerActivityBodySchema, planApi } from "@/lib/api/plan";
import { termLabel } from "@/lib/term";
import type { SummerActivity } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { Notice } from "./notice";
import { usePlanAction } from "./use-plan-action";

/**
 * Summer plans (PLAN §3 "Summer"): internships, research, summer courses, jobs, study abroad. Add, edit and
 * remove, each a request to /api/plan/summer; the list refreshes from the server. Student-entered: tag YOUR PLAN.
 */

export const SUMMER_KINDS: readonly { value: SummerActivity["kind"]; label: string }[] = [
  { value: "internship", label: "Internship" },
  { value: "research", label: "Research" },
  { value: "course", label: "Summer course" },
  { value: "job", label: "Job" },
  { value: "study-abroad", label: "Study abroad" },
  { value: "other", label: "Other" },
];

const KIND_LABEL = Object.fromEntries(
  SUMMER_KINDS.map((kind) => [kind.value, kind.label]),
) as Record<SummerActivity["kind"], string>;

type Draft = {
  termCode: string;
  title: string;
  kind: SummerActivity["kind"];
  organization: string;
  note: string;
};

/** The request body for a summer activity, or the first problem (pure; exported for tests). */
export function summerBody(
  draft: Draft,
):
  | { ok: true; body: Omit<SummerActivity, "id"> }
  | { ok: false; field: keyof Draft; message: string } {
  if (!draft.termCode) return { ok: false, field: "termCode", message: "Choose a summer." };
  if (!draft.title.trim()) return { ok: false, field: "title", message: "Give it a title." };
  const parsed = CreateSummerActivityBodySchema.safeParse({
    termCode: draft.termCode,
    title: draft.title.trim(),
    kind: draft.kind,
    ...(draft.organization.trim() ? { organization: draft.organization.trim() } : {}),
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = (issue?.path[0] as keyof Draft | undefined) ?? "title";
    return { ok: false, field, message: issue?.message ?? "Check the form." };
  }
  return { ok: true, body: parsed.data };
}

function ActivityForm({
  summerTerms,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  summerTerms: readonly string[];
  initial: Draft;
  submitLabel: string;
  onSubmit: (body: Omit<SummerActivity, "id">) => Promise<boolean>;
  onCancel?: () => void;
  busy: boolean;
}) {
  const id = React.useId();
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [problem, setProblem] = React.useState<{ field: keyof Draft; message: string } | null>(
    null,
  );
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const error = (field: keyof Draft) => (problem?.field === field ? problem.message : undefined);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const built = summerBody(draft);
    if (!built.ok) {
      setProblem(built);
      document.getElementById(`${id}-${built.field}`)?.focus();
      return;
    }
    setProblem(null);
    if (await onSubmit(built.body)) {
      if (!onCancel) setDraft({ ...initial, termCode: draft.termCode });
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Field id={`${id}-termCode`} label="Summer" error={error("termCode")}>
        <select
          className={cn(controlClass, "h-11 px-3 md:h-10")}
          value={draft.termCode}
          onChange={(event) => set("termCode", event.target.value)}
        >
          {summerTerms.map((code) => (
            <option key={code} value={code}>
              {termLabel(code)}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${id}-kind`} label="Kind">
        <select
          className={cn(controlClass, "h-11 px-3 md:h-10")}
          value={draft.kind}
          onChange={(event) => set("kind", event.target.value as SummerActivity["kind"])}
        >
          {SUMMER_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${id}-title`} label="Title" error={error("title")}>
        <Input
          value={draft.title}
          maxLength={120}
          onChange={(event) => set("title", event.target.value)}
        />
      </Field>
      <Field
        id={`${id}-organization`}
        label="Organization (optional)"
        error={error("organization")}
      >
        <Input
          value={draft.organization}
          maxLength={120}
          onChange={(event) => set("organization", event.target.value)}
        />
      </Field>
      <Field
        id={`${id}-note`}
        label="Note (optional)"
        error={error("note")}
        className="sm:col-span-2"
      >
        <Textarea
          value={draft.note}
          maxLength={500}
          rows={2}
          onChange={(event) => set("note", event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {onCancel ? null : <Plus aria-hidden />}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ActivityRow({
  activity,
  summerTerms,
}: {
  activity: SummerActivity;
  summerTerms: readonly string[];
}) {
  const [editing, setEditing] = React.useState(false);
  const action = usePlanAction();
  const terms = summerTerms.includes(activity.termCode)
    ? summerTerms
    : [activity.termCode, ...summerTerms];

  if (editing) {
    return (
      <li className="rounded-lg border border-line bg-surface p-3" data-testid="summer-activity">
        <ActivityForm
          summerTerms={terms}
          initial={{
            termCode: activity.termCode,
            title: activity.title,
            kind: activity.kind,
            organization: activity.organization ?? "",
            note: activity.note ?? "",
          }}
          submitLabel={`Save ${activity.title}`}
          busy={action.busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            const result = await action.run(
              () => callApi(planApi.updateSummer, { params: { id: activity.id }, body }),
              { fallback: "Could not save that. Please try again." },
            );
            if (result.ok) setEditing(false);
            return result.ok;
          }}
        />
        <Notice tone="error" className="mt-2" role="alert">
          {action.error}
        </Notice>
      </li>
    );
  }

  return (
    <li
      className="rounded-lg border border-line bg-surface p-3"
      data-testid="summer-activity"
      data-source="my-plan"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-fg">{activity.title}</span>
            <Badge variant="outline">{KIND_LABEL[activity.kind]}</Badge>
            <SourceTag source="my-plan" />
          </p>
          <p className="mt-0.5 text-sm text-fg-2">
            {termLabel(activity.termCode)}
            {activity.organization ? ` · ${activity.organization}` : ""}
          </p>
          {activity.note ? (
            <p className="mt-1 text-sm whitespace-pre-line text-fg-2">{activity.note}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit <span className="sr-only">{activity.title}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={action.busy}
            onClick={async () => {
              const result = await action.run(
                () => callApi(planApi.removeSummer, { params: { id: activity.id } }),
                { fallback: "Could not remove that. Please try again." },
              );
              if (result.ok) toast.success(`Removed ${activity.title}.`);
            }}
          >
            <Trash2 aria-hidden />
            Remove <span className="sr-only">{activity.title}</span>
          </Button>
        </div>
      </div>
      <Notice tone="error" className="mt-2" role="alert">
        {action.error}
      </Notice>
    </li>
  );
}

export function SummerEditor({
  activities,
  summerTerms,
  defaultTerm,
}: {
  activities: readonly SummerActivity[];
  summerTerms: readonly string[];
  defaultTerm: string | null;
}) {
  const action = usePlanAction();
  return (
    <div className="flex flex-col gap-5">
      {activities.length === 0 ? (
        <EmptyState
          icon={Sun}
          title="No summer plans yet"
          description={<p>Keep track of internships, research, summer courses and jobs here.</p>}
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Summer plans">
          {activities.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} summerTerms={summerTerms} />
          ))}
        </ul>
      )}
      <section
        aria-labelledby="summer-add-title"
        className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5"
      >
        <h2 id="summer-add-title" className="text-lg font-strong tracking-title text-fg">
          Add a summer plan
        </h2>
        {summerTerms.length === 0 ? (
          <p className="mt-2 text-sm text-fg-2">Your plan has no summers left.</p>
        ) : (
          <div className="mt-3">
            <ActivityForm
              summerTerms={summerTerms}
              initial={{
                termCode: defaultTerm ?? summerTerms[0] ?? "",
                title: "",
                kind: "internship",
                organization: "",
                note: "",
              }}
              submitLabel="Add summer plan"
              busy={action.busy}
              onSubmit={async (body) => {
                const result = await action.run(() => callApi(planApi.addSummer, { body }), {
                  fallback: "Could not add that. Please try again.",
                });
                if (result.ok) toast.success(`Added ${result.value.activity.title}.`);
                return result.ok;
              }}
            />
            <Notice tone="error" className="mt-3" role="alert">
              {action.error}
            </Notice>
          </div>
        )}
      </section>
    </div>
  );
}
