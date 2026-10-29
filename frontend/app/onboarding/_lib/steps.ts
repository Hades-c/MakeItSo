import {
  ONBOARDING_STEPS,
  parseOnboardingStep,
  REQUIRED_ONBOARDING_STEPS,
  routes,
  safeCallbackPath,
  type OnboardingStep,
} from "@/lib/routes";

/**
 * The first-run steps (PLAN §3 /onboarding; PLAN-UX §8). The step lives in the URL (`/onboarding?step=classes`).
 * "about" is required (isRequiredStep): until it is saved the later steps stay closed (stepLocked) and there is no
 * Skip setup. Every other step can be skipped ("Classes" never blocks: its skip link reads "Add classes later"),
 * and a student who leaves comes back where they stopped: `/onboarding` without a step resumes after the furthest
 * step that already holds saved data (resumeStep). Pure and isomorphic.
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
      return "Interests and goals";
  }
}

/** "about" cannot be skipped: MakeItSo needs the class year and first term to mean anything on Today or Plan. */
export function isRequiredStep(step: OnboardingStep): boolean {
  return (REQUIRED_ONBOARDING_STEPS as readonly OnboardingStep[]).includes(step);
}

/** Every required step is saved: Skip setup shows, and every step can be opened. */
export function requiredStepsSaved(progress: StepProgress): boolean {
  return REQUIRED_ONBOARDING_STEPS.every((step) => progress[step]);
}

/**
 * Whether `step` stays closed for a student still in their first run: a step after a required one that is not
 * saved yet. An onboarded student re-running the flow can open every step.
 */
export function stepLocked(
  step: OnboardingStep,
  progress: StepProgress,
  onboarded: boolean,
): boolean {
  if (onboarded) return false;
  const index = stepIndex(step);
  return REQUIRED_ONBOARDING_STEPS.some(
    (required) => stepIndex(required) < index && !progress[required],
  );
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
  /** The student's first term is after the current one, so there are no current classes to add. */
  startsLater: boolean;
  /** Completed plan items, any term (AP/transfer included). */
  completedItems: number;
  interests: readonly string[];
  /** Goal slugs (lib/goals.ts): the optional second half of the interests step. */
  goals: readonly string[];
}

export function stepProgress(input: ProgressInput): StepProgress {
  return {
    about: input.firstTerm !== null || input.majors.length > 0 || input.minors.length > 0,
    // A later-term starter has nothing to add here, so the step counts as done.
    classes: input.currentTermItems > 0 || input.startsLater,
    completed: input.completedItems > 0,
    interests: input.interests.length > 0 || input.goals.length > 0,
  };
}

/**
 * Where `/onboarding` without a step picks up: a required step that is not saved yet, else the step after the
 * furthest one with saved data (so steps the student skipped on the way are not forced on them again), the last
 * step when that is the furthest, and the first step for a fresh account. An onboarded student re-running the
 * flow starts at the beginning.
 */
export function resumeStep(progress: StepProgress, onboarded: boolean): OnboardingStep {
  if (onboarded) return ONBOARDING_STEPS[0];
  // A required step not saved yet comes first: the steps after it are still closed (stepLocked).
  const missing = REQUIRED_ONBOARDING_STEPS.find((step) => !progress[step]);
  if (missing) return missing;
  let furthest = -1;
  ONBOARDING_STEPS.forEach((step, index) => {
    if (progress[step]) furthest = index;
  });
  return ONBOARDING_STEPS[Math.min(furthest + 1, ONBOARDING_STEPS.length - 1)] ?? "about";
}
