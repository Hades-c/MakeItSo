import "server-only";
import { aiFailure, type AiResult, type CareerPlan } from "@/lib/types/ai";
import type { PlanDraft } from "@/lib/types/plan";
import { hashInput, readPersonal, writePersonal } from "@/server/ai/cache";
import {
  careerCandidates,
  publishedTerms,
  selectCareerCandidates,
  termDataProbe,
  termRefs,
  type CareerCandidate,
} from "@/server/ai/candidates";
import { requestDeadline } from "@/server/ai/client";
import { AI_MODEL, TTL_MS } from "@/server/ai/config";
import {
  currentDraft,
  generateGrounded,
  okResult,
  spendOnGeneration,
  takenCodes,
  termsUntilGraduation,
} from "@/server/ai/features/common";
import {
  candidateIndex,
  groundPicks,
  stillOffered,
  type GroundingResult,
} from "@/server/ai/grounding";
import { careerPayload, studentPlanPayload, studentProfilePayload } from "@/server/ai/payloads";
import {
  careerPlanRequest,
  MAX_COURSES,
  MAX_EXPERIENCES,
  MAX_PROGRAMS,
  OutputSchema,
  PROMPT_VERSION,
  SYSTEM,
  type CareerPlanData,
  type CareerPlanOutput,
} from "@/server/ai/prompts/career-plan";
import {
  anyOf,
  cleanParagraph,
  cleanText,
  forbiddenClaims,
  type SentenceFilter,
} from "@/server/ai/sanitize";
import {
  deadlines,
  programSubjects,
  properNouns,
  unknownCourses,
  unknownPrograms,
  vocabularyOf,
} from "@/server/ai/text-grounding";
import { aiDay, recordUsage, refundQuotas } from "@/server/ai/usage";
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
 * 30 days per student and career: the input hash covers the student, the career content, the official names and
 * the upcoming terms, not the catalog's candidates (see plan-suggestions.ts); a cached plan is served while every
 * drafted course is still a candidate for its term with the same basis.
 *
 * Free text is grounded too (text-grounding.ts): overview and experience sentences that name a course outside the
 * candidates and the plan, a major or minor that is not official, a deadline or date, or an organisation that is
 * nowhere in the data the model was given (experiences: any unknown proper noun) are dropped; an experience
 * whose title or "when" fails, or whose "why" is empty afterwards, is dropped.
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

export interface CareerTextContext {
  /** Texts the model was given whose words may appear as proper nouns (career content, titles, names, terms). */
  vocabulary: readonly string[];
}

export function groundCareerPlan(
  output: CareerPlanOutput,
  context: {
    candidates: readonly CareerCandidate[];
    taken: ReadonlySet<string>;
    official: { majors: readonly string[]; minors: readonly string[] };
    careerName: string;
  } & Partial<CareerTextContext>,
): CareerGrounding {
  const programs = unknownPrograms(programSubjects(context.official));
  const grounded = groundPicks(output.courses, context.candidates, {
    taken: context.taken,
    maxItems: MAX_COURSES,
    fallbackReason: (candidate) =>
      candidate.curatedWhy ?? `Useful preparation for ${context.careerName}.`,
    reasonFilter: programs,
  });
  const vocabulary = vocabularyOf([
    SYSTEM,
    context.careerName,
    ...context.official.majors,
    ...context.official.minors,
    ...context.candidates.map((c) => c.title),
    ...(context.vocabulary ?? []),
  ]);
  const mentionable = new Set([...candidateIndex(context.candidates).keys(), ...context.taken]);
  const grounding: SentenceFilter = anyOf(
    forbiddenClaims,
    unknownCourses(mentionable),
    programs,
    deadlines,
  );
  const overview = cleanParagraph(
    output.overview,
    700,
    anyOf(grounding, properNouns(vocabulary, { strict: false })),
  );
  const strict = anyOf(grounding, properNouns(vocabulary, { strict: true }));
  const experiences = output.experiences
    .map((e) => {
      const title = cleanText(e.title, { maxLength: 80 });
      const when = cleanText(e.when, { maxLength: 60 });
      return {
        title: strict(title) ? "" : title,
        when: strict(when) ? "" : when,
        why: cleanParagraph(e.why, 240, strict),
      };
    })
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

/** The data texts of a career plan request whose words may appear as proper nouns in the answer. */
export function careerVocabulary(data: CareerPlanData): string[] {
  const career = data.catalog.career;
  return [
    career.name,
    career.summary,
    ...career.whatYouDo,
    ...career.departments.map((d) => d.name),
    ...career.relatedPrograms,
    ...career.davidsonResources,
    ...data.catalog.upcomingTerms.map((t) => t.label),
    ...data.catalog.candidates.flatMap((c) => [c.title, c.curatedWhy ?? ""]),
  ];
}

export async function generateCareerPlan(
  userId: string,
  input: { careerSlug: string; regenerate: boolean },
): Promise<AiResult<CareerPlanResult>> {
  const deadlineAt = requestDeadline();
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
  // The whole pool (for checking a cached plan); the prompt gets selectCareerCandidates of it.
  const pool = await careerCandidates({
    career,
    resolved,
    windowTerms,
    taken,
    hasData,
    limit: Infinity,
    departmentLimit: Infinity,
  });
  const candidates = selectCareerCandidates(pool);
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
  // The student and the curated/official data, not the catalog's candidates (see the module comment).
  const inputHash = hashInput({
    feature: "career-plan",
    promptVersion: PROMPT_VERSION,
    model: AI_MODEL,
    registrationTerm: data.catalog.registrationTerm,
    upcomingTerms: data.catalog.upcomingTerms,
    career: data.catalog.career,
    programs: data.catalog.programs,
    profile: data.profile,
    plan: data.plan,
    goals: data.goals,
  });

  const key = career.slug;
  const cached = await readPersonal<CareerPlanResult>("career-plan", userId, key);
  let servable: CareerPlanResult | null = null;
  if (cached?.status === "ok" && cached.inputHash === inputHash && cached.data) {
    const stored = cached.data;
    if (!stored.draft) servable = { plan: stored.plan, draft: null };
    else if (stillOffered(stored.draft.items, pool)) {
      const draft = await currentDraft(userId, stored.draft);
      if (draft) servable = { plan: stored.plan, draft };
    }
  }
  if (servable && cached && !input.regenerate) {
    await recordUsage({
      userId,
      feature: "career-plan",
      kind: "cache-hit",
      servedModel: cached.provenance.model,
    });
    return okResult(servable, {
      servedModel: cached.provenance.model,
      fallbackUsed: cached.fallbackUsed,
      cached: true,
    });
  }

  // A regeneration only when it replaces a plan that would have been served.
  const regeneration = input.regenerate && servable !== null;
  const spend = await spendOnGeneration(userId, { regeneration });
  if ("failure" in spend) return spend.failure;

  const vocabulary = careerVocabulary(data);
  const result = await generateGrounded(
    OutputSchema,
    careerPlanRequest(data),
    (output) =>
      groundCareerPlan(output, {
        candidates,
        taken,
        official: names,
        careerName: career.name,
        vocabulary,
      }),
    { userId, regeneration, promptVersion: PROMPT_VERSION, deadlineAt },
  );
  if (result.kind === "failed") {
    if (result.nothingAnswered) await refundQuotas(spend.receipt);
    return result.failure;
  }

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
