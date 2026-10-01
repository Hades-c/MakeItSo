"use client";

import * as React from "react";
import { ChevronDown, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { controlClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { callApi } from "@/lib/api/client";
import { planApi, type UpdatePlanItemBody } from "@/lib/api/plan";
import { termLabel } from "@/lib/term";
import type { PlanItem, PlanStatus, PlanWarning } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { NOT_IN_CATALOG } from "../_lib/four-year";
import {
  creditsText,
  INACTIVE_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_OPTIONS,
} from "../_lib/labels";
import { ConfirmButton } from "./confirm-button";
import { Notice } from "./notice";
import { usePlanAction } from "./use-plan-action";

/**
 * One course in the 4-year plan: code, title, credits, status and P/F in words, its warnings, and an "Edit"
 * panel (a button with aria-expanded, never hover-only) to change the status, elect or drop P/F, move it to
 * another term, plan a retake or remove it (after an in-page confirm). Any course the catalog could not confirm
 * (converted from the legacy plan or entered by hand) says "Not found in the Davidson catalog — edit or remove":
 * the plan view does not say where an unverified item came from once it is saved as v2.
 */

export interface PlanItemRowProps {
  item: PlanItem;
  /** Terms the course may move to (the plan's range; "" = before Davidson for AP/transfer). */
  moveTerms: readonly string[];
  /** Terms a retake may go to (empty: no retake offered). */
  retakeTerms: readonly string[];
  warnings: readonly PlanWarning[];
  /** "Already completed in Fall 2025 — plan a retake?" for a later planned copy. */
  retakeNote?: string | null;
  /** The element (a term heading, tabIndex -1) that gets focus once this course is removed. */
  focusAfterRemove: string;
}

function termName(code: string): string {
  return code === "" ? "Before Davidson (AP/transfer)" : termLabel(code);
}

export function PlanItemRow({
  item,
  moveTerms,
  retakeTerms,
  warnings,
  retakeNote,
  focusAfterRemove,
}: PlanItemRowProps) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<PlanStatus>(item.status);
  const [passFail, setPassFail] = React.useState(item.passFail);
  const [term, setTerm] = React.useState(item.termCode ?? "");
  const [retakeTerm, setRetakeTerm] = React.useState(retakeTerms[0] ?? "");
  const [notice, setNotice] = React.useState<string | null>(null);
  const action = usePlanAction();

  // A refresh brings the stored values: adopt them (during render, not in an effect).
  const stored = `${item.status}|${item.passFail}|${item.termCode ?? ""}`;
  const [synced, setSynced] = React.useState(stored);
  if (synced !== stored) {
    setSynced(stored);
    setStatus(item.status);
    setPassFail(item.passFail);
    setTerm(item.termCode ?? "");
  }

  const label = `${item.courseCode}${item.termCode ? `, ${termLabel(item.termCode)}` : ""}`;
  const inactive = INACTIVE_STATUSES.has(item.status);
  const canBeforeDavidson = item.source === "ap" || item.source === "transfer";
  const termChoices = [
    ...(canBeforeDavidson ? [""] : []),
    ...moveTerms.filter((code) => code !== ""),
  ];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const patch: UpdatePlanItemBody = {};
    if (status !== item.status) patch.status = status;
    if (passFail !== item.passFail) patch.passFail = passFail;
    if (term !== (item.termCode ?? "")) patch.termCode = term === "" ? null : term;
    if (Object.keys(patch).length === 0) {
      setNotice("Nothing changed.");
      return;
    }
    setNotice(null);
    const result = await action.run(
      () => callApi(planApi.updateItem, { params: { id: item.id }, body: patch }),
      { fallback: `Could not update ${item.courseCode}. Please try again.` },
    );
    if (result.ok) {
      const extra = result.value.warnings.map((warning) => warning.message);
      setNotice([`Saved ${item.courseCode}.`, ...extra].join(" "));
    } else {
      // Not saved: show what is stored again, so the form agrees with the row and the server.
      setStatus(item.status);
      setPassFail(item.passFail);
      setTerm(item.termCode ?? "");
    }
  };

  const remove = async () => {
    const result = await action.run(
      () => callApi(planApi.removeItem, { params: { id: item.id } }),
      { fallback: `Could not remove ${item.courseCode}. Please try again.` },
    );
    // The row leaves the page with the refresh: say it in a toast (announced, outside the row), and move focus
    // to the term's heading so the keyboard user keeps their place.
    if (result.ok) {
      toast.success(`Removed ${label} from your plan.`);
      document.getElementById(focusAfterRemove)?.focus();
    }
  };

  const retake = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!retakeTerm) return;
    const result = await action.run(
      () =>
        callApi(planApi.addItem, {
          body: {
            termCode: retakeTerm,
            courseCode: item.courseCode,
            status: "planned",
            // A retake is a Davidson course: an AP, transfer or suggested course is retaken from the catalog.
            source: item.source === "manual" ? "manual" : "catalog",
            ...(item.unverified || item.source === "manual"
              ? { manualTitle: item.title || item.courseCode, manualCredits: item.credits }
              : {}),
          },
        }),
      { fallback: `Could not plan a retake of ${item.courseCode}. Please try again.` },
    );
    if (result.ok) setNotice(`Planned a retake of ${item.courseCode} in ${termLabel(retakeTerm)}.`);
  };

  return (
    <li
      className={cn(
        "rounded-lg border border-line bg-surface px-3 py-2.5",
        inactive && "bg-surface-2",
      )}
      data-testid="plan-item"
      data-status={item.status}
      data-unverified={item.unverified ? "true" : undefined}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <CourseCode code={item.courseCode} />
            <span className={cn("min-w-0 text-sm text-fg", inactive && "text-fg-2 line-through")}>
              {item.title || item.courseCode}
            </span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-2">
            <Badge
              variant={item.status === "completed" ? "success" : inactive ? "neutral" : "outline"}
            >
              {STATUS_LABELS[item.status]}
            </Badge>
            <span>{creditsText(item.credits)}</span>
            {item.passFail ? <Badge variant="outline">Pass/Fail</Badge> : null}
            {item.source !== "catalog" ? <span>· {SOURCE_LABELS[item.source]}</span> : null}
            {item.crn ? <span className="font-mono">· CRN {item.crn}</span> : null}
            {item.unverified ? <Badge variant="warning">Unverified</Badge> : null}
          </p>
          {item.unverified ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-fg">
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-warning" />
              {NOT_IN_CATALOG}
            </p>
          ) : null}
          {retakeNote ? <p className="mt-1 text-xs text-fg">{retakeNote}</p> : null}
          {warnings.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {warnings.map((warning) => (
                <li
                  key={`${warning.code}-${warning.message}`}
                  className="flex items-start gap-1.5 text-xs text-fg"
                >
                  <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-warning" />
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={`${id}-edit`}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
          Edit <span className="sr-only">{label}</span>
        </Button>
      </div>

      <div id={`${id}-edit`} hidden={!open} className="mt-3 border-t border-line pt-3">
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-status`}>Status</Label>
              <select
                id={`${id}-status`}
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
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-term`}>Term</Label>
              <select
                id={`${id}-term`}
                className={cn(controlClass, "h-11 px-3 md:h-10")}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              >
                {termChoices.includes(item.termCode ?? "") ? null : (
                  <option value={item.termCode ?? ""}>{termName(item.termCode ?? "")}</option>
                )}
                {termChoices.map((code) => (
                  <option key={code || "none"} value={code}>
                    {termName(code)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex min-h-11 items-center gap-3">
            <Switch
              id={`${id}-pf`}
              checked={passFail}
              onCheckedChange={(value) => setPassFail(value)}
            />
            <Label htmlFor={`${id}-pf`}>Pass/Fail</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={action.busy}>
              Save changes <span className="sr-only">to {label}</span>
            </Button>
            <ConfirmButton
              question={`Remove ${label} from your plan?`}
              confirmLabel="Yes, remove"
              disabled={action.busy}
              onConfirm={() => void remove()}
            >
              <Trash2 aria-hidden />
              Remove <span className="sr-only">{label}</span>
            </ConfirmButton>
          </div>
        </form>

        {retakeTerms.length > 0 ? (
          <form
            onSubmit={(event) => void retake(event)}
            className="mt-4 flex flex-wrap items-end gap-2"
          >
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor={`${id}-retake`}>Plan a retake in</Label>
              <select
                id={`${id}-retake`}
                className={cn(controlClass, "h-11 px-3 md:h-10")}
                value={retakeTerm}
                onChange={(event) => setRetakeTerm(event.target.value)}
              >
                {retakeTerms.map((code) => (
                  <option key={code} value={code}>
                    {termLabel(code)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary" size="sm" disabled={action.busy}>
              <RotateCcw aria-hidden />
              Plan retake <span className="sr-only">of {item.courseCode}</span>
            </Button>
          </form>
        ) : null}
      </div>

      <div aria-live="polite">
        <Notice tone="error" className="mt-2">
          {action.error}
        </Notice>
        {!action.error && notice ? <p className="mt-2 text-xs text-fg-2">{notice}</p> : null}
      </div>
    </li>
  );
}
