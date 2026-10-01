import { queryString, routes } from "@/lib/routes";

/**
 * The first-run steps (PLAN §3 /onboarding). The step lives in the URL (`/onboarding?step=classes`), every step can
 * be skipped, and a student who leaves comes back where they stopped: `/onboarding` without a step resumes after
 * the furthest step that already holds saved data (resumeStep). Pure and isomorphic.
 */

export const ONBOARDING_STEPS = ["about", "classes", "completed", "interests"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Short labels for the step list. The classes label names the current term. */
export function stepLabel(step: OnboardingStep, currentTermLabel: string): string {
  switch (step) {
    case "about":
      return "About you";
    case "classes":
      return `Your ${currentTermLabel} classes`;
    case "completed":
      return "Courses you have taken";
    case "interests":
      return "Interests";
  }
}

/** The step a `?step=` search param names, or null (missing, repeated or unknown). */
export function parseStep(value: string | string[] | null | undefined): OnboardingStep | null {
  const first = Array.isArray(value) ? value[0] : value;
  return (ONBOARDING_STEPS as readonly string[]).includes(first ?? "")
    ? (first as OnboardingStep)
    : null;
}

/** `/onboarding?step=<step>`. Built here until lib/routes.ts `routes.onboarding()` takes a step (contract request). */
export function stepHref(step: OnboardingStep): string {
  return `${routes.onboarding()}${queryString({ step })}`;
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** The step after `step`, or null after the last one. */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) + 1] ?? null;
}

/** The step before `step`, or null on the first one. */
export function prevStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step);
  return index > 0 ? (ONBOARDING_STEPS[index - 1] ?? null) : null;
}

/** What is already saved for each step (from the profile and the plan). */
export type StepProgress = Readonly<Record<OnboardingStep, boolean>>;

export interface ProgressInput {
  /** The profile's stored first term (onboarding's first step always saves one); null when never set. */
  firstTerm: string | null;
  majors: readonly string[];
  minors: readonly string[];
  /** Active plan items in the current term. */
  currentTermItems: number;
  /** Completed plan items, any term (AP/transfer included). */
  completedItems: number;
  interests: readonly string[];
}

export function stepProgress(input: ProgressInput): StepProgress {
  return {
    about: input.firstTerm !== null || input.majors.length > 0 || input.minors.length > 0,
    classes: input.currentTermItems > 0,
    completed: input.completedItems > 0,
    interests: input.interests.length > 0,
  };
}

/**
 * Where `/onboarding` without a step picks up: the step after the furthest one with saved data (so steps the
 * student skipped on the way are not forced on them again), the last step when that is the furthest, and the
 * first step for a fresh account. An onboarded student re-running the flow starts at the beginning.
 */
export function resumeStep(progress: StepProgress, onboarded: boolean): OnboardingStep {
  if (onboarded) return ONBOARDING_STEPS[0];
  let furthest = -1;
  ONBOARDING_STEPS.forEach((step, index) => {
    if (progress[step]) furthest = index;
  });
  return ONBOARDING_STEPS[Math.min(furthest + 1, ONBOARDING_STEPS.length - 1)] ?? "about";
}
