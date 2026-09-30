import type { Career } from "@/lib/types/content";

/**
 * SLOT: the AI career plan and cold-email panels (PLAN §3 /careers/[slug], R2). A later lane adds them here after
 * the AI service (W6) merges: generated through lib/api/ai.ts with callApi, gated by aiGateFailure (disabled →
 * not_configured → unverified → consent_required), rendered as text with <AiChip>, the cold e-mail for
 * contactable alumni only. Nothing AI renders on this branch.
 */
export function CareerAiPanelsSlot(_props: { career: Career }) {
  return null;
}
