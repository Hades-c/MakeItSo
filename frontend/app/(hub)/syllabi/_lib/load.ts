import type { AiFailureKind } from "@/lib/types/ai-constants";
import type { Syllabus } from "@/lib/types/syllabus";
import { aiGateFailure } from "@/lib/types/ai";
import { aiGateInput } from "@/server/ai";
import { listSyllabi, syllabusTerms, type SyllabusTerm } from "@/server/syllabi";

/** Whether the paste form itself can be used ("ready"), or why not: AI off deployment-wide ("disabled",
 * "not_configured"), or specific to this student ("unverified", "consent_required"). */
export type PasteGate =
  | "ready"
  | Extract<AiFailureKind, "disabled" | "not_configured" | "unverified" | "consent_required">;

export interface SyllabiPageData {
  syllabi: Syllabus[];
  /** Terms the paste form offers: the current term and the next one, with their days when known. */
  terms: readonly SyllabusTerm[];
  /** The paste form's default term: the current one. */
  defaultTerm: string;
  gate: PasteGate | null;
  /** With gate "unverified": the server's words (depends on the AI_ALLOW_UNVERIFIED switch). */
  unverifiedMessage?: string;
}

async function safe<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[syllabi] could not load ${what}:`, error);
    return null;
  }
}

async function loadGate(
  userId: string,
): Promise<{ gate: PasteGate; unverifiedMessage?: string } | null> {
  const input = await safe("the AI gate", () => aiGateInput(userId, "syllabus-deadlines"));
  if (!input) return null;
  const failure = aiGateFailure(input);
  if (!failure) return { gate: "ready" };
  return {
    gate: failure.kind as PasteGate,
    ...(failure.kind === "unverified" ? { unverifiedMessage: failure.message } : {}),
  };
}

export async function loadSyllabiPage(userId: string): Promise<SyllabiPageData> {
  const [syllabi, terms, gate] = await Promise.all([
    safe("your syllabi", () => listSyllabi(userId)),
    // Never fails on its own (falls back to the terms by date), but stays guarded like its neighbours.
    safe("the term list", () => syllabusTerms()),
    loadGate(userId),
  ]);
  return {
    syllabi: syllabi ?? [],
    terms: terms ?? [],
    defaultTerm: terms?.[0]?.code ?? "",
    gate: gate?.gate ?? null,
    ...(gate?.unverifiedMessage ? { unverifiedMessage: gate.unverifiedMessage } : {}),
  };
}
