"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { controlClass } from "@/components/ui/input";
import { SourceTag } from "@/components/ui/source-tag";
import { termLabel } from "@/lib/term";
import type { PlanItem, PlanWarning } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { nextStep, onboardingNext, prevStep, stepHref, type OnboardingStep } from "../_lib/steps";

/**
 * Small building blocks shared by the steps: a native <select> in the Lakeside control style (long official-name
 * lists stay usable on phones and with assistive tech), the Back / Skip / Continue row, a polite status line and a
 * plan item row.
 *
 * Step links never prefetch: the steps differ only in `?step=`, and with prefetching Next 16 applied the prefetched
 * step's document title (generateMetadata) to the page being shown, so the route announcer read the wrong step.
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

/**
 * The page to continue to after setup (`?next=`, checked with onboardingNext), or null for Today. Step links keep
 * it, so a first-run deep link survives moving between steps.
 */
export function useSetupNext(): string | null {
  // Null outside the App Router (component tests render the steps on their own).
  const params = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  return onboardingNext(params?.get("next"));
}

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
  const after = useSetupNext();
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {back ? (
          <Button asChild variant="ghost">
            <Link href={stepHref(back, after)} prefetch={false}>
              Back
            </Link>
          </Button>
        ) : null}
        {next && !hideSkip ? (
          <Button asChild variant="secondary">
            <Link href={stepHref(next, after)} prefetch={false} data-testid="skip-step">
              Skip this step
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">{primary}</div>
    </div>
  );
}

/**
 * Move keyboard focus to an element by id once React has rendered the change that produced it (a result line that
 * just appeared, the next row after a removal, the first invalid field). Each call focuses again, even for the
 * same id. Used wherever an action unmounts the control that had focus, so focus never falls back to <body>.
 */
export function useFocusRequest(): (id: string) => void {
  const [request, setRequest] = React.useState<{ id: string; count: number } | null>(null);
  React.useEffect(() => {
    if (request) document.getElementById(request.id)?.focus();
  }, [request]);
  return React.useCallback(
    (id: string) => setRequest((last) => ({ id, count: (last?.count ?? 0) + 1 })),
    [],
  );
}

/** The id of a plan item row's Remove button. */
export function removeButtonId(item: Pick<PlanItem, "id">): string {
  return `remove-${item.id}`;
}

/**
 * Where focus goes after removing `list[index]`: the next row's Remove button, else the previous row's, else the
 * list's heading (when the list is now empty).
 */
export function focusAfterRemove(
  list: readonly Pick<PlanItem, "id">[],
  index: number,
  headingId: string,
): string {
  const neighbour = list[index + 1] ?? list[index - 1];
  return neighbour ? removeButtonId(neighbour) : headingId;
}

/** Next-step link styled as the primary button. */
export function ContinueLink({ step, children }: { step: OnboardingStep; children?: string }) {
  const next = nextStep(step);
  const after = useSetupNext();
  if (!next) return null;
  return (
    <Button asChild>
      <Link href={stepHref(next, after)} prefetch={false}>
        {children ?? "Continue"}
      </Link>
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
        id={removeButtonId(item)}
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
