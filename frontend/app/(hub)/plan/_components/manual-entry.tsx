"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, controlClass } from "@/components/ui/input";
import { callApi } from "@/lib/api/client";
import { planApi, type AddPlanItemBody } from "@/lib/api/plan";
import { termLabel } from "@/lib/term";
import { CourseCodeSchema } from "@/lib/types/common";
import type { PlanStatus } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { STATUS_OPTIONS } from "../_lib/labels";
import { Notice } from "./notice";
import { usePlanAction } from "./use-plan-action";

/**
 * Manual entries for the 4-year plan: transfer credit, AP credit, or a course the catalog does not list. The
 * course code is checked here and on the server; a code the catalog has never listed is stored `unverified`
 * with the title and credits typed here (credits default 1, never 4: Davidson courses are 1 credit).
 */

export type ManualKind = "transfer" | "ap" | "manual";

const KINDS: readonly { value: ManualKind; label: string; hint: string }[] = [
  {
    value: "transfer",
    label: "Transfer credit",
    hint: "A course taken at another college, under its Davidson equivalent code.",
  },
  { value: "ap", label: "AP credit", hint: "The Davidson course your AP score counts as." },
  {
    value: "manual",
    label: "A course not in the catalog",
    hint: "A course the Davidson schedule does not list (it is marked unverified).",
  },
];

/** The request body for a manual entry, or the first problem with the form (pure; exported for tests). */
export function manualEntryBody(form: {
  kind: ManualKind;
  courseCode: string;
  title: string;
  credits: string;
  termCode: string;
  status: PlanStatus;
}): { ok: true; body: AddPlanItemBody } | { ok: false; field: string; message: string } {
  const code = CourseCodeSchema.safeParse(form.courseCode);
  if (!code.success) {
    return { ok: false, field: "courseCode", message: "Enter a course code such as CHE 115." };
  }
  const title = form.title.trim();
  if (title.length === 0) return { ok: false, field: "title", message: "Enter the course title." };
  if (title.length > 200)
    return { ok: false, field: "title", message: "Keep the title under 200 characters." };
  const credits = form.credits.trim() === "" ? 1 : Number(form.credits);
  if (!Number.isFinite(credits) || credits < 0 || credits > 4) {
    return {
      ok: false,
      field: "credits",
      message: "Credits are a number from 0 to 4 (most courses are 1).",
    };
  }
  if (form.termCode === "" && form.kind === "manual") {
    return {
      ok: false,
      field: "termCode",
      message: "Choose the term you take (or took) the course.",
    };
  }
  return {
    ok: true,
    body: {
      termCode: form.termCode === "" ? null : form.termCode,
      courseCode: code.data,
      source: form.kind,
      status: form.status,
      manualTitle: title,
      manualCredits: credits,
    },
  };
}

export function ManualEntryForm({ terms }: { terms: readonly string[] }) {
  const id = React.useId();
  const [kind, setKind] = React.useState<ManualKind>("transfer");
  const [courseCode, setCourseCode] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [credits, setCredits] = React.useState("1");
  const [termCode, setTermCode] = React.useState("");
  const [status, setStatus] = React.useState<PlanStatus>("completed");
  const [problem, setProblem] = React.useState<{ field: string; message: string } | null>(null);
  const action = usePlanAction();
  const preMatric = kind !== "manual";

  const changeKind = (next: ManualKind) => {
    setKind(next);
    setProblem(null);
    if (next === "manual") {
      setStatus("planned");
      if (termCode === "") setTermCode(terms[0] ?? "");
    } else {
      setStatus("completed");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const built = manualEntryBody({ kind, courseCode, title, credits, termCode, status });
    if (!built.ok) {
      setProblem(built);
      document.getElementById(`${id}-${built.field}`)?.focus();
      return;
    }
    setProblem(null);
    const result = await action.run(() => callApi(planApi.addItem, { body: built.body }), {
      fallback: "Could not add that course. Please try again.",
    });
    if (result.ok) {
      toast.success(`Added ${result.value.item.courseCode} to your plan.`);
      for (const warning of result.value.warnings) toast.warning(warning.message);
      setCourseCode("");
      setTitle("");
      setCredits("1");
    }
  };

  const error = (field: string) => (problem?.field === field ? problem.message : undefined);

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">What are you adding?</legend>
        {KINDS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1"
          >
            <input
              type="radio"
              name={`${id}-kind`}
              value={option.value}
              checked={kind === option.value}
              onChange={() => changeKind(option.value)}
              className="mt-1 size-4 accent-primary-fill"
            />
            <span className="text-sm">
              <span className="font-semibold text-fg">{option.label}</span>
              <span className="block text-xs text-fg-2">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${id}-courseCode`}
          label="Course code"
          error={error("courseCode")}
          hint="e.g. CHE 115"
        >
          <Input
            value={courseCode}
            onChange={(event) => setCourseCode(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field
          id={`${id}-credits`}
          label="Credits"
          error={error("credits")}
          hint="Most Davidson courses are 1 credit"
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={4}
            step={0.25}
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
          />
        </Field>
        <Field id={`${id}-title`} label="Title" error={error("title")} className="sm:col-span-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
        </Field>
        <Field id={`${id}-termCode`} label="Term" error={error("termCode")}>
          <select
            className={cn(controlClass, "h-11 px-3 md:h-10")}
            value={termCode}
            onChange={(event) => setTermCode(event.target.value)}
          >
            {preMatric ? <option value="">Before Davidson (no term)</option> : null}
            {terms.map((code) => (
              <option key={code} value={code}>
                {termLabel(code)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-status`} label="Status">
          <select
            className={cn(controlClass, "h-11 px-3 md:h-10")}
            value={status}
            onChange={(event) => setStatus(event.target.value as PlanStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Notice tone="error" role="alert">
        {action.error}
      </Notice>
      <div>
        <Button type="submit" disabled={action.busy}>
          <Plus aria-hidden />
          Add to my plan
        </Button>
      </div>
    </form>
  );
}
