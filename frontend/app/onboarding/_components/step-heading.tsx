"use client";

import { useEffect, useRef } from "react";
import type { OnboardingStep } from "../_lib/steps";

/**
 * The step's h1. After a step change inside the flow (Continue, Skip, Back, the step list) focus moves to it, so
 * keyboard and screen-reader users start at the new step instead of at the top of the document; Next's route
 * announcer reads the step-specific document title. Not on the first load of the page (focus stays where the
 * browser puts it). The last step shown is kept per page load (module scope), so a remount still counts as a
 * change.
 */

let lastShown: OnboardingStep | null = null;

export const STEP_HEADING_ID = "onboarding-step-heading";

export function StepHeading({ step, children }: { step: OnboardingStep; children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (lastShown !== null && lastShown !== step) ref.current?.focus();
    lastShown = step;
  }, [step]);
  return (
    <h1
      ref={ref}
      id={STEP_HEADING_ID}
      tabIndex={-1}
      className="rounded-sm text-xl font-strong text-fg md:text-2xl"
    >
      {children}
    </h1>
  );
}

/** Tests only: forget the last step shown (a fresh page load). */
export function resetStepHeadingForTests(): void {
  lastShown = null;
}
