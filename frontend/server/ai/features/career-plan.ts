import "server-only";
import { aiFailure, type AiResult, type CareerPlan } from "@/lib/types/ai";
import type { PlanDraft } from "@/lib/types/plan";
import { hashInput, readPersonal, writePersonal } from "@/server/ai/cache";
import {
  careerCandidates,
  publishedTerms,
  termDataProbe,
  termRefs,
  type CareerCandidate,
} from "@/server/ai/candidates";
import { AI_MODEL, TTL_MS } from "@/server/ai/config";
import {
  currentDraft,
  generateGrounded,
  okResult,
  spendOnGeneration,
  takenCodes,
  termsUntilGraduation,
} from "@/server/ai/features/common";
import { groundPicks, type GroundingResult } from "@/server/ai/grounding";
import { careerPayload, studentPlanPayload, studentProfilePayload } from "@/server/ai/payloads";
import {
  careerPlanRequest,
  MAX_COURSES,
  MAX_EXPERIENCES,
  MAX_PROGRAMS,
  OutputSchema,
  PROMPT_VERSION,
  type CareerPlanData,
  type CareerPlanOutput,
} from "@/server/ai/prompts/career-plan";
import { cleanParagraph, cleanText } from "@/server/ai/sanitize";
import { aiDay, recordUsage } from "@/server/ai/usage";
import { getProfile } from "@/server/auth/profile";
import { resolveTerms } from "@/server/catalog";
import { now } from "@/server/clock";
import { getCareer } from "@/server/content/careers";
import { ApiError } from "@/server/http/errors";
import { getPlan, saveDraft } from "@/server/plan";
import { programNames } from "@/server/programs";

/**
 * Career plan (PLAN §6.1 W6 feature 3): the curated career path + real catalog candidates + the official Acalog
 * major/minor names. Majors and minors must be official names (others are dropped); courses are grounded like
 * plan suggestions (> 30% dropped → invalid, one retry) and become a "career-plan" PlanDraft. Personal, cached
 * 30 days per student and career.
 */

export interface CareerPlanResult {
  plan: CareerPlan;
  draft: PlanDraft | null;
}

export const NO_CAREER_CANDIDATES_MESSAGE =
  "MakeItSo found no upcoming catalog courses for this career path yet, so there is no plan to draft.";

type CareerGrounding = GroundingResult & { plan: CareerPlan };

/** Keep official names only (exact), at most `max`, without duplicates. */
export function officialOnly(names: readonly string[], official: readonly string[], max: number) {
  const allowed = new Set(official);
  return [...new Set(names.map((n) => n.trim()))].filter((n) => allowed.has(n)).slice(0, max);
}

export function groundCareerPlan(
  output: CareerPlanOutput,
  context: {
    candidates: readonly CareerCandidate[];
    taken: ReadonlySet<string>;
    official: { majors: readonly string[]; minors: readonly string[] };
    careerName: string;
  },
): CareerGrounding {
  const grounded = groundPicks(output.courses, context.candidates, {
    taken: context.taken,
    maxItems: MAX_COURSES,
    fallbackReason: (candidate) =>
      candidate.curatedWhy ?? `Useful preparation for ${context.careerName}.`,
  });
  const overview = cleanParagraph(output.overview, 700);
  const experiences = output.experiences
    .map((e) => ({
      title: cleanText(e.title, { maxLength: 80 }),
      when: cleanText(e.when, { maxLength: 60 }),
      why: cleanParagraph(e.why, 240),
    }))
    .filter((e) => e.title && e.when && e.why)
    .slice(0, MAX_EXPERIENCES);
  const plan: CareerPlan = {
    overview,
    majors: officialOnly(output.majors, context.official.majors, MAX_PROGRAMS),
    minors: officialOnly(output.minors, context.official.minors, MAX_PROGRAMS),
    courses: grounded.items.map((item) => ({
      courseCode: item.courseCode,
      termCode: item.termCode,
      reason: item.reason,
    })),
    experiences,
  };
  return { ...grounded, invalid: grounded.invalid || !overview, plan };
}

export async function generateCareerPlan(
  userId: string,
  input: { careerSlug: string; regenerate: boolean },
): Promise<AiResult<CareerPlanResult>> {
  const career = getCareer(input.careerSlug);
  if (!career) throw new ApiError(404, "not_found", "There is no such career path.");

  const [resolved, profile, plan, names] = await Promise.all([
    resolveTerms(),
    getProfile(userId),
    getPlan(userId),
    programNames(),
  ]);
  const windowTerms = termsUntilGraduation(resolved.registration, profile.graduationYear);
  const taken = takenCodes(plan.items);
  const hasData = termDataProbe();
  const candidates = await careerCandidates({ career, resolved, windowTerms, taken, hasData });
  if (candidates.length === 0) return aiFailure("invalid", NO_CAREER_CANDIDATES_MESSAGE);

  const data: CareerPlanData = {
    catalog: {
      today: aiDay(now()),
      registrationTerm: resolved.registration,
      upcomingTerms: termRefs(await publishedTerms(windowTerms, hasData), windowTerms),
      career: careerPayload(career),
      programs: { majors: names.majors, minors: names.minors },
      candidates: candidates.map((c) => ({
        courseCode: c.courseCode,
        title: c.title,
        terms: c.termList,
        ...(c.curatedWhy ? { curatedWhy: c.curatedWhy } : {}),
      })),
    },
    profile: studentProfilePayload(profile, names),
    plan: { items: studentPlanPayload(plan.items) },
    goals: { career: career.slug, careerName: career.name },
  };
  const inputHash = hashInput({
    feature: "career-plan",
    promptVersion: PROMPT_VERSION,
    model: AI_MODEL,
    catalog: { ...data.catalog, today: undefined },
    profile: data.profile,
    plan: data.plan,
    goals: data.goals,
  });

  const key = career.slug;
  const cached = await readPersonal<CareerPlanResult>("career-plan", userId, key);
  if (
    !input.regenerate &&
    cached?.status === "ok" &&
    cached.inputHash === inputHash &&
    cached.data
  ) {
    const draft = cached.data.draft ? await currentDraft(userId, cached.data.draft) : null;
    if (!cached.data.draft || draft) {
      await recordUsage({
        userId,
        feature: "career-plan",
        kind: "cache-hit",
        servedModel: cached.provenance.model,
      });
      return okResult(
        { plan: cached.data.plan, draft },
        { servedModel: cached.provenance.model, fallbackUsed: cached.fallbackUsed, cached: true },
      );
    }
  }

  const regeneration = input.regenerate && cached?.status === "ok";
  const spend = await spendOnGeneration(userId, { regeneration });
  if (spend) return spend;

  const result = await generateGrounded(
    OutputSchema,
    careerPlanRequest(data),
    (output) =>
      groundCareerPlan(output, {
        candidates,
        taken,
        official: names,
        careerName: career.name,
      }),
    { userId, regeneration, promptVersion: PROMPT_VERSION },
  );
  if (result.kind === "failed") return result.failure;

  const { plan: careerPlan, items } = result.grounded;
  const draft =
    items.length > 0
      ? await saveDraft(userId, { kind: "career-plan", promptVersion: PROMPT_VERSION, items })
      : null;
  await writePersonal("career-plan", userId, key, {
    inputHash,
    promptVersion: PROMPT_VERSION,
    status: "ok",
    data: { plan: careerPlan, draft } satisfies CareerPlanResult,
    servedModel: result.outcome.servedModel,
    fallbackUsed: result.outcome.fallbackUsed,
    ttlMs: TTL_MS.personal,
  });
  return okResult(
    { plan: careerPlan, draft },
    {
      servedModel: result.outcome.servedModel,
      fallbackUsed: result.outcome.fallbackUsed,
      cached: false,
    },
  );
}
