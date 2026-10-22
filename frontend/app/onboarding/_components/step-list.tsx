import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_STEPS,
  stepHref,
  stepLabel,
  type OnboardingStep,
  type StepProgress,
} from "../_lib/steps";

/**
 * The four steps as links (every step can be skipped, so any step can be opened), the current one marked with
 * aria-current="step" and the ones with saved data with a check (and "saved" for screen readers). Server component.
 */
export function StepList({
  step,
  progress,
  currentTermLabel,
  next = null,
}: {
  step: OnboardingStep;
  progress: StepProgress;
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
          return (
            <li key={item}>
              <Link
                href={stepHref(item, next)}
                prefetch={false}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  current
                    ? "border-primary bg-primary-wash font-semibold text-primary"
                    : "border-line bg-surface text-fg-2 hover:bg-surface-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border font-mono text-xs",
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
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
