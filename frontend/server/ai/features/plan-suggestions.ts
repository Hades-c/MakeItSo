import "server-only";
import { compareTerms, termLabel, termsBetween, type TermCode } from "@/lib/term";
import { aiFailure, type AiResult } from "@/lib/types/ai";
import type { PlanDraft } from "@/lib/types/plan";
import { hashInput, readPersonal, writePersonal } from "@/server/ai/cache";
import { planCandidates, type PlanCandidate } from "@/server/ai/candidates";
import { AI_MODEL, TTL_MS } from "@/server/ai/config";
import {
  classYearIn,
  currentDraft,
  generateGrounded,
  okResult,
  openRequirementCodes,
  spendOnGeneration,
  takenCodes,
} from "@/server/ai/features/common";
import { groundPicks } from "@/server/ai/grounding";
import { requirementRefs, studentPlanPayload, studentProfilePayload } from "@/server/ai/payloads";
import {
  MAX_PICKS,
  OutputSchema,
  planSuggestionsRequest,
  PROMPT_VERSION,
  type PlanSuggestionsData,
} from "@/server/ai/prompts/plan-suggestions";
import { aiDay, recordUsage } from "@/server/ai/usage";
import { getProfile } from "@/server/auth/profile";
import { resolveTerms } from "@/server/catalog";
import { now } from "@/server/clock";
import { requirementName } from "@/server/content/requirements";
import { ApiError } from "@/server/http/errors";
import { getPlan, getProgress, saveDraft } from "@/server/plan";
import { programNames } from "@/server/programs";

/**
 * Plan suggestions (PLAN §6.1 W6 feature 2): retrieve-then-rank for one target term (default: the registration
 * term), stored as a PlanDraft through server/plan saveDraft. Personal, cached 30 days per student and target
 * term; a changed plan or profile (a new input hash) is a cache miss, `regenerate` forces a new answer and
 * counts against the 3 regenerations a day.
 */

export interface PlanSuggestionsResult {
  draft: PlanDraft;
}

/** How far ahead suggestions may be asked for (regular terms after the registration term). */
const MAX_TERMS_AHEAD = 8;

export const NO_CANDIDATES_MESSAGE =
  "MakeItSo found no courses for that term that fill your open requirements, so there is nothing to suggest.";

export function targetTermProblem(target: TermCode, registration: TermCode): string | null {
  if (compareTerms(target, registration) < 0) {
    return `Suggestions are for ${termLabel(registration)} or later.`;
  }
  if (termsBetween(registration, target, { includeSummer: true }).length > MAX_TERMS_AHEAD * 2) {
    return "That term is too far ahead for suggestions.";
  }
  return null;
}

function fallbackReason(candidate: PlanCandidate): string {
  return candidate.fills.length > 0
    ? `Counts toward ${candidate.fills.map((code) => requirementName(code)).join(" and ")}.`
    : "Fits the rest of your plan.";
}

export async function generatePlanSuggestions(
  userId: string,
  input: { termCode?: TermCode; regenerate: boolean },
): Promise<AiResult<PlanSuggestionsResult>> {
  const resolved = await resolveTerms();
  const target = input.termCode ?? resolved.registration;
  const problem = targetTermProblem(target, resolved.registration);
  if (problem) throw new ApiError(400, "validation_failed", problem);

  const [profile, plan, progress, names] = await Promise.all([
    getProfile(userId),
    getPlan(userId),
    getProgress(userId),
    programNames(),
  ]);
  const openCodes = openRequirementCodes(progress);
  const taken = takenCodes(plan.items);
  const candidates = await planCandidates({
    targetTerm: target,
    openCodes,
    taken,
    classYear: classYearIn(profile.standing.standing, resolved.current, target),
    compMet: progress.reqs.COMP === "done" || progress.reqs.COMP === "this-term",
  });
  if (candidates.length === 0) return aiFailure("invalid", NO_CANDIDATES_MESSAGE);

  const data: PlanSuggestionsData = {
    catalog: {
      today: aiDay(now()),
      currentTerm: resolved.current,
      registrationTerm: resolved.registration,
      targetTerm: {
        code: target,
        label: termLabel(target),
        scheduled: candidates.some((c) => c.basis === "scheduled"),
      },
      candidates: candidates.map((c) => ({
        courseCode: c.courseCode,
        title: c.title,
        basis: c.basis,
        ...(c.ranIn.length > 0 ? { ranIn: c.ranIn } : {}),
        fills: c.fills.map((code) => `${requirementName(code)} (${code})`),
        flags: c.flags,
      })),
    },
    profile: studentProfilePayload(profile, names),
    plan: { items: studentPlanPayload(plan.items), openRequirements: requirementRefs(openCodes) },
  };
  // Today's date is context only: the same plan on another day is the same answer.
  const inputHash = hashInput({
    feature: "plan-suggestions",
    promptVersion: PROMPT_VERSION,
    model: AI_MODEL,
    target,
    profile: data.profile,
    plan: data.plan,
    candidates: data.catalog.candidates,
  });

  const cached = await readPersonal<PlanSuggestionsResult>("plan-suggestions", userId, target);
  if (
    !input.regenerate &&
    cached?.status === "ok" &&
    cached.inputHash === inputHash &&
    cached.data
  ) {
    const draft = await currentDraft(userId, cached.data.draft);
    if (draft) {
      await recordUsage({
        userId,
        feature: "plan-suggestions",
        kind: "cache-hit",
        servedModel: cached.provenance.model,
      });
      return okResult(
        { draft },
        { servedModel: cached.provenance.model, fallbackUsed: cached.fallbackUsed, cached: true },
      );
    }
  }

  const regeneration = input.regenerate && cached?.status === "ok";
  const spend = await spendOnGeneration(userId, { regeneration });
  if (spend) return spend;

  const result = await generateGrounded(
    OutputSchema,
    planSuggestionsRequest(data),
    (output) =>
      groundPicks(output.picks, candidates, { taken, maxItems: MAX_PICKS, fallbackReason }),
    { userId, regeneration, promptVersion: PROMPT_VERSION },
  );
  if (result.kind === "failed") return result.failure;

  const draft = await saveDraft(userId, {
    kind: "plan-suggestions",
    promptVersion: PROMPT_VERSION,
    items: result.grounded.items,
  });
  await writePersonal("plan-suggestions", userId, target, {
    inputHash,
    promptVersion: PROMPT_VERSION,
    status: "ok",
    data: { draft } satisfies PlanSuggestionsResult,
    servedModel: result.outcome.servedModel,
    fallbackUsed: result.outcome.fallbackUsed,
    ttlMs: TTL_MS.personal,
  });
  return okResult(
    { draft },
    {
      servedModel: result.outcome.servedModel,
      fallbackUsed: result.outcome.fallbackUsed,
      cached: false,
    },
  );
}
