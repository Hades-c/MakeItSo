import "server-only";
import type { AiResult, CareerSummers } from "@/lib/types/ai";
import { hashInput, readPersonal, writePersonal } from "@/server/ai/cache";
import { requestDeadline } from "@/server/ai/client";
import { AI_MODEL, MAX_DROPPED_SHARE, TTL_MS } from "@/server/ai/config";
import { generateGrounded, okResult, spendOnGeneration } from "@/server/ai/features/common";
import { careerPayload, careerSummersProfilePayload } from "@/server/ai/payloads";
import {
  careerSummersRequest,
  MAX_PICKS,
  OutputSchema,
  PROMPT_VERSION,
  SYSTEM,
  type CareerSummersData,
  type CareerSummersOutput,
  type SummerOptionPayload,
} from "@/server/ai/prompts/career-summers";
import { anyOf, cleanParagraph, forbiddenClaims, type SentenceFilter } from "@/server/ai/sanitize";
import { summerCatalog, type SummerCatalogEntry } from "@/server/ai/summer-catalog";
import {
  anyCourseCode,
  deadlines,
  programSubjects,
  properNouns,
  unknownPrograms,
  vocabularyOf,
} from "@/server/ai/text-grounding";
import { aiDay, recordUsage, refundQuotas } from "@/server/ai/usage";
import { getProfile } from "@/server/auth/profile";
import { now } from "@/server/clock";
import { getCareer } from "@/server/content/careers";
import { ApiError } from "@/server/http/errors";
import { programNames } from "@/server/programs";

/**
 * AI summer picks for a career path (owner request, 2026-11-02: "AI recommended summers for each career path").
 * Personal, cached 30 days per student and career path, like the career plan: the input hash covers the student's
 * allow-listed profile (with the coming summer), the career content and the whole summer catalog, so any change to
 * either asks the model again. `regenerate` spends one of the day's regenerations when it replaces a servable
 * answer.
 *
 * Grounding (binding, docs/CONTRACTS.md "AI wire format"): the model may only name options of the sourced catalog
 * (server/ai/summer-catalog.ts) by id. A pick with an unknown id, a repeated id or no usable "why" is dropped;
 * more than 30% dropped makes the answer invalid (one retry, never cached). The answer stores only ids and the
 * model's text; every fact the student sees about an option (name, page, who it is for, timing, source) is
 * attached from the CURRENT content when the answer is served, and an id the content no longer has is left out.
 * No picks is an answer ("nothing fits well"), as long as the outlook survived the checks.
 *
 * The model's text (outlook, why, next step) is cleaned like the career plan's: links and Markdown removed, and
 * sentences dropped that name a course, an unofficial major or minor, a date or deadline, an eligibility,
 * requirement, GPA or difficulty claim (sanitize.ts), or an organisation that is nowhere in the data the model was
 * given. A next step that fails becomes null; the outlook is optional when there are picks.
 */

export interface CareerSummersResult {
  summers: CareerSummers;
}

/** What the cache keeps: ids and the model's cleaned text, never the options' facts. */
export interface StoredSummers {
  outlook: string;
  picks: { id: string; why: string; nextStep: string | null }[];
}

export const SUMMERS_RETRY_NOTE =
  "Your previous answer named options that are not in <catalog_data>, or gave picks without a usable reason. Choose only ids listed in <catalog_data>, each once, with a short reason.";

export const SUMMERS_GROUNDING_FAILED_MESSAGE =
  "The AI suggested summer options MakeItSo could not match to its list, so nothing is shown. Please try again.";

export const OUTLOOK_MAX = 360;
export const WHY_MAX = 280;
export const NEXT_STEP_MAX = 160;

export interface SummersDropped {
  id: string;
  problem: "not-an-option" | "duplicate" | "no-reason";
}

export interface SummersGrounding {
  items: StoredSummers["picks"];
  dropped: SummersDropped[];
  droppedShare: number;
  invalid: boolean;
  summers: StoredSummers;
}

export interface SummersTextContext {
  /** The catalog ids the model may name. */
  ids: ReadonlySet<string>;
  /** Texts the model was given whose words may appear as proper nouns (official program names are added). */
  vocabulary: readonly string[];
  /** The official Acalog names: a major or minor the answer names must be one of them. */
  official: { majors: readonly string[]; minors: readonly string[] };
}

/** Ground the model's answer (see the module comment). Pure. */
export function groundCareerSummers(
  output: CareerSummersOutput,
  context: SummersTextContext,
): SummersGrounding {
  const vocabulary = vocabularyOf([
    SYSTEM,
    ...context.official.majors,
    ...context.official.minors,
    ...context.vocabulary,
  ]);
  const base: SentenceFilter = anyOf(
    forbiddenClaims,
    anyCourseCode,
    deadlines,
    unknownPrograms(programSubjects(context.official)),
  );
  const loose = anyOf(base, properNouns(vocabulary, { strict: false }));
  const outlook = cleanParagraph(output.outlook, OUTLOOK_MAX, loose);

  const items: StoredSummers["picks"] = [];
  const dropped: SummersDropped[] = [];
  const seen = new Set<string>();
  for (const pick of output.picks) {
    const id = pick.id.trim();
    const drop = (problem: SummersDropped["problem"]) =>
      dropped.push({ id: id.slice(0, 120), problem });
    if (!context.ids.has(id)) {
      drop("not-an-option");
      continue;
    }
    if (seen.has(id)) {
      drop("duplicate");
      continue;
    }
    seen.add(id);
    const why = cleanParagraph(pick.why, WHY_MAX, loose);
    if (!why) {
      drop("no-reason");
      continue;
    }
    if (items.length >= MAX_PICKS) continue;
    const nextStep = cleanParagraph(pick.nextStep, NEXT_STEP_MAX, loose);
    items.push({ id, why, nextStep: nextStep || null });
  }
  const droppedShare = output.picks.length === 0 ? 0 : dropped.length / output.picks.length;
  return {
    items,
    dropped,
    droppedShare,
    invalid: droppedShare > MAX_DROPPED_SHARE || (items.length === 0 && !outlook),
    summers: { outlook, picks: items },
  };
}

/** A stored answer with the current content attached; ids the catalog no longer has are left out. */
export function resolveStoredSummers(
  stored: StoredSummers,
  catalog: readonly SummerCatalogEntry[],
): CareerSummers {
  const byId = new Map(catalog.map((entry) => [entry.option.id, entry.option]));
  return {
    outlook: stored.outlook,
    picks: stored.picks.flatMap((pick) => {
      const option = byId.get(pick.id);
      return option ? [{ option, why: pick.why, nextStep: pick.nextStep }] : [];
    }),
  };
}

/** The options as the model reads them (null fields left out; no URLs). */
export function optionPayloads(catalog: readonly SummerCatalogEntry[]): SummerOptionPayload[] {
  return catalog.map((entry) => ({
    id: entry.option.id,
    name: entry.option.name,
    runBy: entry.option.runBy,
    about: entry.about,
    ...(entry.option.audience ? { for: entry.option.audience } : {}),
    ...(entry.option.timing
      ? { timing: `${entry.option.timing.label}: ${entry.option.timing.text}` }
      : {}),
    ...(entry.amount ? { amount: entry.amount } : {}),
    listedFor: [...entry.listedFor],
    thisPath: entry.option.onThisPage,
  }));
}

/** The data texts whose words may appear as proper nouns in the answer. */
export function summersVocabulary(data: CareerSummersData): string[] {
  const career = data.catalog.career;
  return [
    career.name,
    career.summary,
    ...career.whatYouDo,
    ...career.departments.map((d) => d.name),
    ...career.relatedPrograms,
    ...career.davidsonResources,
    ...data.profile.majors,
    ...data.profile.minors,
    ...data.catalog.options.flatMap((o) => [
      o.name,
      o.runBy,
      o.about,
      o.for ?? "",
      o.timing ?? "",
      ...o.listedFor,
    ]),
  ];
}

export async function generateCareerSummers(
  userId: string,
  input: { careerSlug: string; regenerate: boolean },
): Promise<AiResult<CareerSummersResult>> {
  const deadlineAt = requestDeadline();
  const career = getCareer(input.careerSlug);
  if (!career) throw new ApiError(404, "not_found", "There is no such career path.");

  const [profile, names] = await Promise.all([getProfile(userId), programNames()]);
  const catalog = summerCatalog(career);
  const today = aiDay(now());
  const data: CareerSummersData = {
    catalog: { today, career: careerPayload(career), options: optionPayloads(catalog) },
    profile: careerSummersProfilePayload(profile, names, today),
    goals: { career: career.slug, careerName: career.name },
  };
  // Everything but today's date: the coming summer (in the profile) is what the day changes for this answer.
  const inputHash = hashInput({
    feature: "career-summers",
    promptVersion: PROMPT_VERSION,
    model: AI_MODEL,
    career: data.catalog.career,
    options: data.catalog.options,
    profile: data.profile,
    goals: data.goals,
  });

  const key = career.slug;
  const cached = await readPersonal<StoredSummers>("career-summers", userId, key);
  const servable =
    cached?.status === "ok" && cached.inputHash === inputHash && cached.data ? cached : null;
  if (servable?.data && !input.regenerate) {
    await recordUsage({
      userId,
      feature: "career-summers",
      kind: "cache-hit",
      servedModel: servable.provenance.model,
    });
    return okResult(
      { summers: resolveStoredSummers(servable.data, catalog) },
      {
        servedModel: servable.provenance.model,
        fallbackUsed: servable.fallbackUsed,
        cached: true,
      },
    );
  }

  // A regeneration only when it replaces an answer that would have been served.
  const regeneration = input.regenerate && servable !== null;
  const spend = await spendOnGeneration(userId, { regeneration });
  if ("failure" in spend) return spend.failure;

  const ids = new Set(catalog.map((entry) => entry.option.id));
  const vocabulary = summersVocabulary(data);
  const result = await generateGrounded(
    OutputSchema,
    careerSummersRequest(data),
    (output) => groundCareerSummers(output, { ids, vocabulary, official: names }),
    {
      userId,
      regeneration,
      promptVersion: PROMPT_VERSION,
      deadlineAt,
      retryNote: SUMMERS_RETRY_NOTE,
      failedMessage: SUMMERS_GROUNDING_FAILED_MESSAGE,
    },
  );
  if (result.kind === "failed") {
    if (result.nothingAnswered) await refundQuotas(spend.receipt);
    return result.failure;
  }

  const stored = result.grounded.summers;
  await writePersonal("career-summers", userId, key, {
    inputHash,
    promptVersion: PROMPT_VERSION,
    status: "ok",
    data: stored satisfies StoredSummers,
    servedModel: result.outcome.servedModel,
    fallbackUsed: result.outcome.fallbackUsed,
    ttlMs: TTL_MS.personal,
  });
  return okResult(
    { summers: resolveStoredSummers(stored, catalog) },
    {
      servedModel: result.outcome.servedModel,
      fallbackUsed: result.outcome.fallbackUsed,
      cached: false,
    },
  );
}
