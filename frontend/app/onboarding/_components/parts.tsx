"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { controlClass } from "@/components/ui/input";
import { SourceTag } from "@/components/ui/source-tag";
import { termLabel } from "@/lib/term";
import type { PlanItem, PlanWarning } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { nextStep, prevStep, stepHref, type OnboardingStep } from "../_lib/steps";

/**
 * Small building blocks shared by the steps: a native <select> in the Lakeside control style (long official-name
 * lists stay usable on phones and with assistive tech), the Back / Skip / Continue row, a polite status line and a
 * plan item row.
 */

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <span className="relative block">
    <select
      ref={ref}
      className={cn(controlClass, "h-11 appearance-none pr-9 pl-3 md:h-10", className)}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-3"
    />
  </span>
));
NativeSelect.displayName = "NativeSelect";

export interface StepActionsProps {
  step: OnboardingStep;
  /** The primary action: a submit button (step 1, 4) or a link to the next step (steps 2, 3). */
  primary: React.ReactNode;
  /** Hide "Skip this step" (when the primary action already moves on without saving). */
  hideSkip?: boolean;
}

export function StepActions({ step, primary, hideSkip }: StepActionsProps) {
  const back = prevStep(step);
  const next = nextStep(step);
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {back ? (
          <Button asChild variant="ghost">
            <Link href={stepHref(back)}>Back</Link>
          </Button>
        ) : null}
        {next && !hideSkip ? (
          <Button asChild variant="secondary">
            <Link href={stepHref(next)} data-testid="skip-step">
              Skip this step
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">{primary}</div>
    </div>
  );
}

/** Next-step link styled as the primary button. */
export function ContinueLink({ step, children }: { step: OnboardingStep; children?: string }) {
  const next = nextStep(step);
  if (!next) return null;
  return (
    <Button asChild>
      <Link href={stepHref(next)}>{children ?? "Continue"}</Link>
    </Button>
  );
}

/** A role="status" line (polite). Always rendered so screen readers announce changes. */
export function StatusLine({
  message,
  warnings = [],
  testId,
}: {
  message: string;
  warnings?: readonly PlanWarning[];
  testId?: string;
}) {
  return (
    <div role="status" className="min-h-5 text-sm text-fg-2" data-testid={testId}>
      {message ? <p>{message}</p> : null}
      {warnings.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const SOURCE_NOTES: Partial<Record<PlanItem["source"], string>> = {
  ap: "AP/IB credit",
  transfer: "Transfer credit",
  manual: "Entered by you",
};

/** One plan item: code, title, term or section, a YOUR PLAN tag and Remove. */
export function PlanItemRow({
  item,
  detail,
  onRemove,
  removing,
}: {
  item: PlanItem;
  detail?: React.ReactNode;
  onRemove: () => void;
  removing: boolean;
}) {
  const note = SOURCE_NOTES[item.source];
  return (
    <li
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="plan-item"
      data-code={item.courseCode}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CourseCode code={item.courseCode} />
          <span className="font-semibold text-fg">{item.title}</span>
          <SourceTag source="my-plan" />
        </p>
        <p className="mt-0.5 text-sm text-fg-2">
          {[
            detail,
            item.termCode ? termLabel(item.termCode) : null,
            note,
            item.unverified ? "Unverified" : null,
          ]
            .filter(Boolean)
            .map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 ? " · " : null}
                {part}
              </React.Fragment>
            ))}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        aria-disabled={removing || undefined}
        aria-label={`Remove ${item.courseCode} ${item.termCode ? termLabel(item.termCode) : "credit"}`}
      >
        <Trash2 aria-hidden />
        Remove
      </Button>
    </li>
  );
}
