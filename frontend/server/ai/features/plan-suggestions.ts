import "server-only";
import { compareTerms, isSummer, termLabel, termsBetween, type TermCode } from "@/lib/term";
import { aiFailure, type AiResult } from "@/lib/types/ai";
import type { PlanDraft } from "@/lib/types/plan";
import { hashInput, readPersonal, writePersonal } from "@/server/ai/cache";
import {
  MAX_PLAN_CANDIDATES,
  planCandidates,
  type CandidateFlag,
  type PlanCandidate,
} from "@/server/ai/candidates";
import { requestDeadline } from "@/server/ai/client";
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
import { groundPicks, stillOffered } from "@/server/ai/grounding";
import { requirementRefs, studentPlanPayload, studentProfilePayload } from "@/server/ai/payloads";
import {
  MAX_PICKS,
  OutputSchema,
  planSuggestionsRequest,
  PROMPT_VERSION,
  type PlanSuggestionsData,
} from "@/server/ai/prompts/plan-suggestions";
import { truncate } from "@/server/ai/sanitize";
import { programSubjects, unknownPrograms } from "@/server/ai/text-grounding";
import { aiDay, recordUsage, refundQuotas } from "@/server/ai/usage";
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
 * term. The input hash covers the student's side only (profile, plan, open requirements, target and current
 * terms): the catalog changes all the time during registration (seats every 15 minutes, sections added), and a
 * catalog change alone does not make the saved suggestions wrong. A cached answer is served while its hash
 * matches AND every suggested course is still a candidate for its term with the same basis (still offered, still
 * fills an open slot, the target term not newly scheduled); otherwise it is a miss. `regenerate` forces a new
 * answer and counts against the 3 regenerations a day only when it replaces an answer that would have been
 * served.
 *
 * Restriction flags (class years, W sections once COMP is met, instructor permission) flag, never block: the
 * model sees them, and a flagged pick gets a server-written "Check: …" note appended to its reason.
 */

export interface PlanSuggestionsResult {
  draft: PlanDraft;
}

/** How far ahead suggestions may be asked for (regular terms after the registration term). */
const MAX_TERMS_AHEAD = 8;

export const NO_CANDIDATES_MESSAGE =
  "MakeItSo found no courses for that term that fill your open requirements, so there is nothing to suggest.";

export function targetTermProblem(target: TermCode, registration: TermCode): string | null {
  if (isSummer(target)) return "Suggestions are for fall and spring terms.";
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

/** The server-written note per restriction flag (never from the model). */
export const FLAG_NOTES: Readonly<Record<CandidateFlag, string>> = {
  "restricted-standing": "Check: its sections may be limited to other class years.",
  "comp-met-w-section": "Check: its sections are closed to students who have met COMP.",
  "permission-required": "Check: every section needs instructor permission.",
};

/** PlanDraft item reasons are at most 400 characters (lib/types/plan.ts). */
const DRAFT_REASON_MAX = 400;

/** Append the flag notes to a reason, cutting the model's part so the whole fits a draft item. */
export function withFlagNotes(reason: string, flags: readonly CandidateFlag[]): string {
  if (flags.length === 0) return reason;
  const notes = flags.map((flag) => FLAG_NOTES[flag]).join(" ");
  return `${truncate(reason, DRAFT_REASON_MAX - notes.length - 1)} ${notes}`;
}

export async function generatePlanSuggestions(
  userId: string,
  input: { termCode?: TermCode; regenerate: boolean },
): Promise<AiResult<PlanSuggestionsResult>> {
  const deadlineAt = requestDeadline();
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
  // The whole pool (for checking a cached answer); the prompt gets the first MAX_PLAN_CANDIDATES.
  const pool = await planCandidates({
    targetTerm: target,
    openCodes,
    taken,
    classYear: classYearIn(profile.standing.standing, resolved.current, target),
    compMet: progress.reqs.COMP === "done" || progress.reqs.COMP === "this-term",
    limit: Infinity,
  });
  const candidates = pool.slice(0, MAX_PLAN_CANDIDATES);
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
  // The student's side only (see the module comment); today's date is context only.
  const inputHash = hashInput({
    feature: "plan-suggestions",
    promptVersion: PROMPT_VERSION,
    model: AI_MODEL,
    target,
    currentTerm: resolved.current,
    registrationTerm: resolved.registration,
    profile: data.profile,
    plan: data.plan,
  });

  const cached = await readPersonal<PlanSuggestionsResult>("plan-suggestions", userId, target);
  const cachedDraft =
    cached?.status === "ok" &&
    cached.inputHash === inputHash &&
    cached.data &&
    stillOffered(cached.data.draft.items, pool)
      ? await currentDraft(userId, cached.data.draft)
      : null;
  if (cachedDraft && cached && !input.regenerate) {
    await recordUsage({
      userId,
      feature: "plan-suggestions",
      kind: "cache-hit",
      servedModel: cached.provenance.model,
    });
    return okResult(
      { draft: cachedDraft },
      { servedModel: cached.provenance.model, fallbackUsed: cached.fallbackUsed, cached: true },
    );
  }

  // A regeneration only when it replaces an answer that would have been served.
  const regeneration = input.regenerate && cachedDraft !== null;
  const spend = await spendOnGeneration(userId, { regeneration });
  if ("failure" in spend) return spend.failure;

  const reasonFilter = unknownPrograms(programSubjects(names));
  const result = await generateGrounded(
    OutputSchema,
    planSuggestionsRequest(data),
    (output) =>
      groundPicks(output.picks, candidates, {
        taken,
        maxItems: MAX_PICKS,
        fallbackReason,
        reasonFilter,
      }),
    { userId, regeneration, promptVersion: PROMPT_VERSION, deadlineAt },
  );
  if (result.kind === "failed") {
    if (result.nothingAnswered) await refundQuotas(spend.receipt);
    return result.failure;
  }

  const flagsOf = new Map(candidates.map((c) => [c.courseCode, c.flags]));
  const draft = await saveDraft(userId, {
    kind: "plan-suggestions",
    promptVersion: PROMPT_VERSION,
    items: result.grounded.items.map((item) => ({
      ...item,
      reason: withFlagNotes(item.reason, flagsOf.get(item.courseCode) ?? []),
    })),
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
