import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { AboutStep } from "./_components/about-step";
import { ClassesStep } from "./_components/classes-step";
import { CompletedStep } from "./_components/completed-step";
import { InterestsStep } from "./_components/interests-step";
import { SkipSetup } from "./_components/skip-setup";
import { StepList } from "./_components/step-list";
import { loadOnboarding, type OnboardingData } from "./_lib/load";
import {
  ONBOARDING_STEPS,
  parseStep,
  resumeStep,
  stepHref,
  stepIndex,
  stepLabel,
  type OnboardingStep,
} from "./_lib/steps";

export const metadata: Metadata = { title: "Get started" };

/**
 * /onboarding (PLAN §3; R1): the first run, in four skippable steps with the step in the URL. Without a step it
 * resumes where the student stopped (./_lib/steps resumeStep). A server component that reads the profile, the
 * official program names, the terms and the plan (a legacy v1 plan in memory included) once per request
 * (./_lib/load.ts) and renders one client island per step; every change goes through the lib/api specs (W3
 * profile, W5s plan, W1 catalog).
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const INTROS: Readonly<Record<OnboardingStep, (data: OnboardingData) => string>> = {
  about: () =>
    "Your class year, first term and majors let MakeItSo check your plan. You can change all of this later on your profile.",
  classes: (data) =>
    `Pick the section of each class you are taking in ${data.terms.currentLabel}. They show on Today and in your plan.`,
  completed: () =>
    "Add courses you have already finished, plus AP, IB or transfer credit, so the requirement tracker starts from where you are.",
  interests: () =>
    "Choose career paths you want to explore. Careers and suggestions start from these.",
};

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = parseStep(params.step);
  const user = await requireUser({
    returnTo: requested ? stepHref(requested) : "/onboarding",
  });
  const data = await loadOnboarding(user.id);
  if (!requested) redirect(stepHref(resumeStep(data.progress, data.profile.onboardedAt !== null)));
  const step = requested;
  const firstName = data.profile.name.trim().split(/\s+/)[0];

  return (
    <div data-testid="onboarding" data-step={step}>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1.5 font-mono text-xs font-medium tracking-label text-fg-3 uppercase">
            Step {stepIndex(step) + 1} of {ONBOARDING_STEPS.length}
            {step === "about" && firstName ? ` · Welcome, ${firstName}` : ""}
          </p>
          <h1 className="text-xl font-strong text-fg md:text-2xl">
            {stepLabel(step, data.terms.currentLabel)}
          </h1>
          <p className="mt-1.5 text-sm text-fg-2 md:text-base">{INTROS[step](data)}</p>
        </div>
        {data.profile.onboardedAt === null ? <SkipSetup /> : null}
      </header>

      <StepList step={step} progress={data.progress} currentTermLabel={data.terms.currentLabel} />

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
          <InterestsStep initial={data.profile.interests} careers={data.careers} />
        )}
      </div>
    </div>
  );
}
