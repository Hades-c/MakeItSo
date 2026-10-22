import {
  ONBOARDING_STEPS,
  parseOnboardingStep,
  routes,
  safeCallbackPath,
  type OnboardingStep,
} from "@/lib/routes";

/**
 * The first-run steps (PLAN §3 /onboarding). The step lives in the URL (`/onboarding?step=classes`), every step can
 * be skipped, and a student who leaves comes back where they stopped: `/onboarding` without a step resumes after
 * the furthest step that already holds saved data (resumeStep). Pure and isomorphic.
 */

export { ONBOARDING_STEPS, type OnboardingStep };

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

/** The document title of a step: "Step 2 of 4: Your Fall 2026 classes · Get started". */
export function stepTitle(step: OnboardingStep, currentTermLabel: string): string {
  return `Step ${stepIndex(step) + 1} of ${ONBOARDING_STEPS.length}: ${stepLabel(step, currentTermLabel)} · Get started`;
}

/** The step a `?step=` search param names, or null (missing, repeated or unknown). */
export const parseStep = parseOnboardingStep;

/**
 * `/onboarding?step=<step>`, keeping `next` (the page the student asked for before the hub sent them here, already
 * checked with safeAppPath) so finishing or skipping setup still continues there.
 */
export function stepHref(step: OnboardingStep, next?: string | null): string {
  return routes.onboarding(step, { next: next ?? undefined });
}

/** Any origin: safeCallbackPath only needs one to resolve relative paths and to refuse other hosts. */
const PATH_BASE = "http://onboarding.invalid";

/**
 * The `?next=` page to continue to once setup is finished or skipped, or null for the default (Today). The hub
 * layout sends a first-run deep link here with it (/onboarding?next=%2Fplan%3Ftab%3Dfour-year); it is untrusted
 * input, so only a same-origin app path passes (lib/routes.ts safeCallbackPath: never "//host", never /login or
 * /register), and /today and /onboarding itself are dropped (Today is the default; onboarding would loop).
 */
export function onboardingNext(value: string | string[] | null | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || !first.startsWith("/")) return null;
  const path = safeCallbackPath(first, PATH_BASE, "");
  if (!path) return null;
  const pathname = path.split(/[?#]/)[0] ?? "";
  if (
    pathname === routes.today() ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/")
  ) {
    return null;
  }
  return path;
}

/** Where finishing or skipping setup goes: `next` when there is one, else Today. */
export function afterSetupHref(next: string | null | undefined): string {
  return next ?? routes.today();
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
