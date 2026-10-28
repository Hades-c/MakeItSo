import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_STEPS,
  stepHref,
  stepLabel,
  stepLocked,
  type OnboardingStep,
  type StepProgress,
} from "../_lib/steps";

/**
 * The four steps as links (every step after "About you" can be skipped, so any step can be opened once About is
 * saved), the current one marked with aria-current="step" and the ones with saved data with a check (and "saved"
 * for screen readers). While "About you" is not saved in a first run, the later steps are plain text (not links)
 * that say so, instead of links that would send the student back. Server component.
 */
export function StepList({
  step,
  progress,
  onboarded = false,
  currentTermLabel,
  next = null,
}: {
  step: OnboardingStep;
  progress: StepProgress;
  /** Onboarded already (a re-run): no step is closed. */
  onboarded?: boolean;
  currentTermLabel: string;
  /** The page to continue to after setup (`?next=`, already checked), kept on every step link. */
  next?: string | null;
}) {
  return (
    <nav aria-label="Setup steps" className="mb-6">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ONBOARDING_STEPS.map((item, index) => {
          const current = item === step;
          const saved = progress[item];
          const locked = !current && stepLocked(item, progress, onboarded);
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums",
                  saved
                    ? "border-transparent bg-success-wash text-success"
                    : "border-line-strong text-fg-2",
                )}
              >
                {saved ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="sr-only">Step {index + 1}: </span>
                {stepLabel(item, currentTermLabel)}
                {saved ? <span className="sr-only"> (saved)</span> : null}
                {locked ? <span className="sr-only"> (opens after About you)</span> : null}
              </span>
            </>
          );
          const box = "flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm";
          return (
            <li key={item}>
              {locked ? (
                <span
                  className={cn(box, "border-dashed border-line bg-surface text-fg-3")}
                  data-locked=""
                >
                  {body}
                </span>
              ) : (
                <Link
                  href={stepHref(item, next)}
                  prefetch={false}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    box,
                    current
                      ? "border-primary bg-primary-wash font-semibold text-primary"
                      : "border-line bg-surface text-fg-2 hover:bg-surface-2",
                  )}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
