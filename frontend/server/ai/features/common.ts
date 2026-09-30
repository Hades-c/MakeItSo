import "server-only";
import type { z } from "zod";
import { termsBetween, type TermCode } from "@/lib/term";
import {
  ACTIVE_PLAN_STATUSES,
  type PlanDraft,
  type PlanItem,
  type PlanProgress,
} from "@/lib/types/plan";
import { aiFailure, type AiFailure, type AiOk } from "@/lib/types/ai";
import type { ReqCode } from "@/lib/types/catalog";
import { normalizeCourseCode } from "@/lib/types/common";
import { generate, type GenerateOutcome, type GenerateRequest } from "@/server/ai/client";
import { RETRY_DEADLINE_MS } from "@/server/ai/config";
import type { GroundingResult } from "@/server/ai/grounding";
import {
  budgetFailure,
  consumeGenerationQuota,
  consumeRegenerationQuota,
  recordUsage,
} from "@/server/ai/usage";
import { listDrafts } from "@/server/plan";

/**
 * Shared steps of the generating features: spending (budget → regeneration quota → generation quota), one model
 * call with its usage recorded, the grounding retry, and plan helpers.
 */

/**
 * Before a cache-miss generation for a student: the budget (checked first, so a paused day burns no quota),
 * then, for an explicit regeneration of an existing personal item, the regeneration quota, then the
 * generation quota. Returns the failure to answer with, or null.
 */
export async function spendOnGeneration(
  userId: string,
  { regeneration }: { regeneration: boolean },
): Promise<AiFailure | null> {
  const budget = await budgetFailure();
  if (budget) return budget;
  if (regeneration) {
    const regen = await consumeRegenerationQuota(userId);
    if (regen) return regen;
  }
  return consumeGenerationQuota(userId);
}

/** generate() + the usage record (tokens count toward the budget whatever the outcome). */
export async function callModel<S extends z.ZodType>(
  schema: S,
  request: GenerateRequest,
  { userId, regeneration = false }: { userId: string | null; regeneration?: boolean },
): Promise<GenerateOutcome<z.output<S>>> {
  const outcome = await generate(schema, request);
  await recordUsage({
    userId,
    feature: request.feature,
    kind: "generation",
    usage: outcome.usage,
    servedModel: outcome.servedModel,
    fallbackUsed: outcome.fallbackUsed,
    failed: outcome.kind !== "ok",
    regeneration,
  });
  return outcome;
}

export function failureOf(outcome: { kind: string; message: string }): AiFailure {
  return aiFailure(outcome.kind as AiFailure["kind"], outcome.message);
}

export const GROUNDING_FAILED_MESSAGE =
  "The AI suggested courses MakeItSo could not match to the catalog, so nothing is shown. Please try again.";

export type GroundedOutcome<T, G> =
  | { kind: "ok"; outcome: Extract<GenerateOutcome<T>, { kind: "ok" }>; grounded: G }
  | { kind: "failed"; failure: AiFailure };

/**
 * Call the model and ground its answer; when grounding fails (> 30% dropped, or nothing usable), log it with the
 * promptVersion and retry once while the request is young enough. Never cached when it fails.
 */
export async function generateGrounded<S extends z.ZodType, G extends GroundingResult>(
  schema: S,
  request: GenerateRequest,
  ground: (data: z.output<S>) => G,
  options: { userId: string | null; regeneration: boolean; promptVersion: string },
): Promise<GroundedOutcome<z.output<S>, G>> {
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const outcome = await callModel(schema, request, {
      userId: options.userId,
      regeneration: options.regeneration && attempt === 1,
    });
    if (outcome.kind !== "ok") return { kind: "failed", failure: failureOf(outcome) };
    const grounded = ground(outcome.data);
    if (!grounded.invalid) return { kind: "ok", outcome, grounded };
    console.warn(
      `[ai] ${request.feature} ${options.promptVersion}: grounding failed on attempt ${attempt} (${grounded.dropped.length} dropped, ${grounded.items.length} kept, problems: ${[...new Set(grounded.dropped.map((d) => d.problem))].join(", ") || "none"})`,
    );
    if (attempt === 2 || Date.now() - startedAt > RETRY_DEADLINE_MS) break;
    const budget = await budgetFailure();
    if (budget) return { kind: "failed", failure: budget };
  }
  return { kind: "failed", failure: aiFailure("invalid", GROUNDING_FAILED_MESSAGE) };
}

export function okResult<T>(
  data: T,
  meta: { servedModel: string; fallbackUsed: boolean; cached: boolean },
): AiOk<T> {
  return { kind: "ok", data, ...meta };
}

// ---- Plan helpers --------------------------------------------------------------------------------------------------

const ACTIVE = new Set<string>(ACTIVE_PLAN_STATUSES);

/** Canonical and listing codes of every active plan item (completed or planned in any term: siblings count). */
export function takenCodes(items: readonly PlanItem[]): Set<string> {
  const taken = new Set<string>();
  for (const item of items) {
    if (!ACTIVE.has(item.status)) continue;
    taken.add(normalizeCourseCode(item.canonicalCode));
    taken.add(normalizeCourseCode(item.courseCode));
  }
  return taken;
}

/** Slots of the requirement tracker that are open, as requirement codes (PE is not in the course API). */
export function openRequirementCodes(progress: Pick<PlanProgress, "reqs">): ReqCode[] {
  const codes: ReqCode[] = [];
  for (const [slot, status] of Object.entries(progress.reqs)) {
    if (status !== "open" || slot === "PE") continue;
    codes.push(slot as ReqCode);
  }
  return codes;
}

const STANDING_YEAR: Record<string, number | null> = {
  incoming: 1,
  "first-year": 1,
  sophomore: 2,
  junior: 3,
  senior: 4,
  graduated: null,
};

/** The academic year (its end year) a term belongs to: Fall 2026, Spring 2027 and Summer 2027 → 2027. */
function academicYearEnd(term: TermCode): number {
  return Number(term.slice(0, 4)) + 1;
}

/** The student's class year (1–4) in `term`, from the current standing; null once graduated. */
export function classYearIn(
  standing: string,
  currentTerm: TermCode,
  term: TermCode,
): number | null {
  const base = STANDING_YEAR[standing];
  if (base === null || base === undefined) return null;
  const year = base + academicYearEnd(term) - academicYearEnd(currentTerm);
  return Math.min(4, Math.max(1, year));
}

/** Regular terms from `from` through the graduation spring (at most `max`); `[from]` when already past. */
export function termsUntilGraduation(from: TermCode, graduationYear: number, max = 8): TermCode[] {
  const lastSpring = `${graduationYear - 1}02`;
  const terms = termsBetween(from, lastSpring);
  return (terms.length > 0 ? terms : [from]).slice(0, max);
}

/**
 * The stored draft as it is now (status may have changed since it was cached); null when it is gone. If the plan
 * service cannot list drafts, the cached copy is returned unchanged.
 */
export async function currentDraft(userId: string, draft: PlanDraft): Promise<PlanDraft | null> {
  try {
    const drafts = await listDrafts(userId);
    return drafts.find((d) => d.id === draft.id) ?? null;
  } catch (error) {
    console.error(
      "[ai] could not refresh a cached draft:",
      error instanceof Error ? error.message : error,
    );
    return draft;
  }
}
