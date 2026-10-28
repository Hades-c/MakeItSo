import type { AiFailureKind } from "@/lib/types/ai-constants";
import type { Syllabus } from "@/lib/types/syllabus";
import { aiGateFailure } from "@/lib/types/ai";
import { aiGateInput } from "@/server/ai";
import { resolveTerms } from "@/server/catalog";
import { listSyllabi } from "@/server/syllabi";

/** Whether the upload form itself can be used ("ready"), or why not: AI off deployment-wide ("disabled",
 * "not_configured"), or specific to this student ("unverified", "consent_required"). */
export type UploadGate =
  | "ready"
  | Extract<AiFailureKind, "disabled" | "not_configured" | "unverified" | "consent_required">;

export interface SyllabiPageData {
  syllabi: Syllabus[];
  /** Terms the upload form offers, in catalog order (current and registration terms included). */
  terms: readonly { code: string; label: string }[];
  /** The upload form's default term: the registration term, falling back to the first term offered. */
  defaultTerm: string;
  gate: UploadGate | null;
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
): Promise<{ gate: UploadGate; unverifiedMessage?: string } | null> {
  const input = await safe("the AI gate", () => aiGateInput(userId, "syllabus-deadlines"));
  if (!input) return null;
  const failure = aiGateFailure(input);
  if (!failure) return { gate: "ready" };
  return {
    gate: failure.kind as UploadGate,
    ...(failure.kind === "unverified" ? { unverifiedMessage: failure.message } : {}),
  };
}

export async function loadSyllabiPage(userId: string): Promise<SyllabiPageData> {
  const [syllabi, resolved, gate] = await Promise.all([
    safe("your syllabus uploads", () => listSyllabi(userId)),
    safe("the term list", () => resolveTerms()),
    loadGate(userId),
  ]);
  const terms = resolved?.terms.map((term) => ({ code: term.code, label: term.label })) ?? [];
  return {
    syllabi: syllabi ?? [],
    terms,
    defaultTerm: resolved?.registration ?? terms[0]?.code ?? "",
    gate: gate?.gate ?? null,
    ...(gate?.unverifiedMessage ? { unverifiedMessage: gate.unverifiedMessage } : {}),
  };
}
