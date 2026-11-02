import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDavidsonEmail } from "@/lib/api/account";
import { routes, VERIFY_SENT } from "@/lib/routes";
import { requireUser } from "@/server/auth";
import { isMailAvailable } from "@/server/auth/mailer";
import { isEmailVerified } from "@/server/auth/session";
import { AboutStep } from "./_components/about-step";
import { ClassesStep } from "./_components/classes-step";
import { CompletedStep } from "./_components/completed-step";
import { InterestsStep } from "./_components/interests-step";
import { SkipSetup } from "./_components/skip-setup";
import { StepHeading } from "./_components/step-heading";
import { StepList } from "./_components/step-list";
import { VerifySentNote } from "./_components/verify-sent-note";
import { currentTermLabel, loadOnboarding, type OnboardingData } from "./_lib/load";
import {
  ONBOARDING_STEPS,
  onboardingNext,
  parseStep,
  requiredStepsSaved,
  resumeStep,
  SETUP_TITLE,
  stepHref,
  stepIndex,
  stepLabel,
  stepLocked,
  stepTitle,
  type OnboardingStep,
} from "./_lib/steps";

/**
 * /onboarding (PLAN §3; R1; PLAN-UX §8): "Set up your account", the first run in four steps with the step in the
 * URL. A new account comes here straight from /register (`?step=about`, plus `&verify=sent` when registering
 * e-mailed a verification code: step 1 then says so in one quiet line, VerifySentNote, while the address is still
 * unverified and mail can be sent; the line links to /verify, which has "Send a new code"). "About you" is
 * required: it has no "Skip this step" link, the later steps stay closed until it is saved (a later step's URL
 * redirects to it), and the global "Skip setup" button only appears once it is saved. Every later step can be
 * skipped; "Your classes" never blocks (its skip link reads "Add classes later", and it counts as done for a
 * student who starts in a later term). Without a step it resumes where the student stopped (./_lib/steps
 * resumeStep). `?next=` (a first-run deep link the hub sent here) is kept on every step link and is where Skip
 * setup and Finish go instead of Today. A server component that reads the profile, the official program names, the
 * terms and the plan (a legacy v1 plan in memory included) once per request (./_lib/load.ts) and renders one
 * client island per step; every change goes through the lib/api specs (W3 profile, W5s plan, W1 catalog).
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * A step-specific title ("Step 2 of 4: Your Fall 2026 classes · Set up your account"): Next's route announcer reads
 * the document title after a client navigation, so every step change is announced.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const step = parseStep((await searchParams).step);
  if (!step) return { title: SETUP_TITLE };
  return { title: stepTitle(step, await currentTermLabel()) };
}

const INTROS: Readonly<Record<OnboardingStep, (data: OnboardingData) => string>> = {
  about: () =>
    "Your class year, first term and majors let MakeItSo check your plan. You can change all of this later on your profile.",
  classes: (data) =>
    `Pick the section of each class you are taking in ${data.terms.currentLabel}. They show on Today and in your plan.`,
  completed: () =>
    "Add courses you have already finished, plus AP, IB or transfer credit, so the requirement tracker starts from where you are.",
  interests: () =>
    "Choose career paths you want to explore and, if you like, what you hope to do at Davidson. With AI features on, plan suggestions, career plans and cold-email drafts start from these.",
};

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = parseStep(params.step);
  // The page to continue to after setup: the hub sends a first-run deep link here with ?next= (app/(hub)/layout).
  const next = onboardingNext(params.next);
  const user = await requireUser({
    returnTo: requested
      ? stepHref(requested, next)
      : routes.onboarding(undefined, { next: next ?? undefined }),
  });
  const data = await loadOnboarding(user.id);
  const onboarded = data.profile.onboardedAt !== null;
  if (!requested || stepLocked(requested, data.progress, onboarded)) {
    redirect(stepHref(resumeStep(data.progress, onboarded), next));
  }
  const step = requested;
  const firstName = data.profile.name.trim().split(/\s+/)[0];
  // Said once: only on step 1 of a first run, only on the URL /register sent here, only while still true.
  const verifySent =
    step === "about" &&
    !onboarded &&
    params.verify === VERIFY_SENT &&
    !isEmailVerified(user) &&
    isDavidsonEmail(user.email) &&
    isMailAvailable();

  return (
    <div data-testid="onboarding" data-step={step}>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium tracking-label text-fg-3 uppercase">
            {SETUP_TITLE} · Step {stepIndex(step) + 1} of {ONBOARDING_STEPS.length}
            {step === "about" && firstName ? ` · Welcome, ${firstName}` : ""}
          </p>
          <StepHeading step={step}>{stepLabel(step, data.terms.currentLabel)}</StepHeading>
          <p className="mt-1.5 text-sm text-fg-2 md:text-base">{INTROS[step](data)}</p>
        </div>
        {!onboarded && requiredStepsSaved(data.progress) ? <SkipSetup /> : null}
      </header>

      <StepList
        step={step}
        progress={data.progress}
        onboarded={onboarded}
        currentTermLabel={data.terms.currentLabel}
        next={next}
      />

      {verifySent ? <VerifySentNote email={user.email} returnTo={stepHref(step, next)} /> : null}

      {data.legacyPlan && (step === "classes" || step === "completed") ? (
        <p className="mb-4 rounded-md border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg-2">
          These include courses from your earlier MakeItSo plan. They are copied to your new plan
          the first time you change something.
        </p>
      ) : null}

      <div className="rounded-lg border border-line bg-surface p-4 md:p-6">
        {step === "about" ? (
          <AboutStep
            initial={{
              graduationYear: data.profile.graduationYear,
              firstTerm: data.profile.firstTerm,
              majors: data.profile.majors,
              minors: data.profile.minors,
            }}
            majorNames={data.majors}
            minorNames={data.minors}
            now={data.now}
          />
        ) : step === "classes" ? (
          <ClassesStep
            term={data.terms.current}
            termLabel={data.terms.currentLabel}
            status={data.terms.currentStatus}
            startsLater={data.terms.startsLater}
            firstTerm={data.terms.firstTerm}
            items={data.items}
          />
        ) : step === "completed" ? (
          <CompletedStep terms={data.terms.completedTerms} items={data.items} />
        ) : (
          <InterestsStep
            initial={data.profile.interests}
            initialGoals={data.profile.goals}
            careers={data.careers}
          />
        )}
      </div>
    </div>
  );
}
