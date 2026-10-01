import "server-only";
import type { Profile } from "@/lib/api/profile";
import { currentTermFrom, termLabel, type TermCode } from "@/lib/term";
import type { TermInfo } from "@/lib/types/catalog";
import type { PlanItem } from "@/lib/types/plan";
import { getProfile, officialNames } from "@/server/auth";
import { resolveTerms } from "@/server/catalog";
import { now } from "@/server/clock";
import { CAREERS, type CareerCluster } from "@/server/content/careers";
import { MissingFixtureError } from "@/server/http/fixtures";
import { getPlan } from "@/server/plan";
import { defaultFirstTerm } from "./academics";
import {
  completedItems,
  completedTermOptions,
  currentClassStatus,
  startsAfter,
  termItems,
} from "./plan-items";
import { stepProgress, type StepProgress } from "./steps";

/**
 * Everything /onboarding renders, read once per request on the server (PLAN §3 /onboarding). Each step's client
 * island gets plain, serialisable props and keeps its own copy of what it edits.
 *
 *   profile       getProfile (W3): official names already mapped; firstTerm null until saved
 *   majors/...    official Acalog names (W3 officialNames: server/programs, else the checked-in snapshot)
 *   careers       the interests taxonomy (career-path slugs, server/content)
 *   terms         the current term (step 2 "Your Fall 2026 classes"), the status its classes get, and the
 *                 terms a completed course can come from (first term → the term before the current one)
 *   items         the plan as getPlan returns it: v2, or a legacy v1 plan converted in memory (legacy: true),
 *                 so a re-run and a legacy student see what is already there and nothing is added twice
 *   progress      what is already saved per step (for the step list and for resuming)
 */

export interface CareerOption {
  slug: string;
  name: string;
  cluster: CareerCluster;
}

export interface OnboardingTerms {
  current: TermCode;
  currentLabel: string;
  /** Status for classes added in step 2. */
  currentStatus: "in-progress" | "registered";
  /** The student's first term (stored, else Fall of graduationYear − 4). */
  firstTerm: TermCode;
  /** First term after the current one: an incoming student has no current classes. */
  startsLater: boolean;
  /** Newest first. */
  completedTerms: TermCode[];
}

export interface OnboardingData {
  profile: Pick<
    Profile,
    "name" | "majors" | "minors" | "graduationYear" | "firstTerm" | "interests" | "onboardedAt"
  >;
  majors: string[];
  minors: string[];
  careers: CareerOption[];
  terms: OnboardingTerms;
  items: PlanItem[];
  /** The plan is a legacy (v1) plan shown in memory; it is copied to the new plan on the first change. */
  legacyPlan: boolean;
  progress: StepProgress;
  now: string;
}

/** The current term's TermInfo, from the catalog's resolved terms; the date rules when the catalog cannot answer. */
async function loadCurrentTerm(at: Date): Promise<{ code: TermCode; info?: TermInfo }> {
  try {
    const resolved = await resolveTerms({ now: at });
    return {
      code: resolved.current,
      info: resolved.terms.find((term) => term.code === resolved.current),
    };
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    console.error("[onboarding] terms unavailable, using the date rules:", error);
    return { code: currentTermFrom([], { now: at }) };
  }
}

export async function loadOnboarding(userId: string): Promise<OnboardingData> {
  const at = now();
  const [view, majors, minors, plan, current] = await Promise.all([
    getProfile(userId),
    officialNames("major"),
    officialNames("minor"),
    getPlan(userId),
    loadCurrentTerm(at),
  ]);
  const firstTerm = view.firstTerm ?? defaultFirstTerm(view.graduationYear);
  const startsLater = startsAfter(firstTerm, current.code);
  const items = plan.items;

  return {
    profile: {
      name: view.name,
      majors: view.majors,
      minors: view.minors,
      graduationYear: view.graduationYear,
      firstTerm: view.firstTerm,
      interests: view.interests,
      onboardedAt: view.onboardedAt,
    },
    majors: majors.names,
    minors: minors.names,
    careers: CAREERS.map(({ slug, name, cluster }) => ({ slug, name, cluster })),
    terms: {
      current: current.code,
      currentLabel: termLabel(current.code),
      currentStatus: currentClassStatus(current.info, at),
      firstTerm,
      startsLater,
      completedTerms: startsLater ? [] : completedTermOptions(firstTerm, current.code),
    },
    items,
    legacyPlan: plan.legacy,
    progress: stepProgress({
      firstTerm: view.firstTerm,
      majors: view.majors,
      minors: view.minors,
      currentTermItems: termItems(items, current.code).length,
      completedItems: completedItems(items).length,
      interests: view.interests,
    }),
    now: at.toISOString(),
  };
}
