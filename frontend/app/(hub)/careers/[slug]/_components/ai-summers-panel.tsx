import { unstable_rethrow } from "next/navigation";
import { SectionCard } from "@/components/ui/section-card";
import type { Flags } from "@/lib/flags";
import { aiGateFailure, type AiFailure, type AiGateInput } from "@/lib/types/ai";
import type { Career } from "@/lib/types/content";
import { aiFeatureEnabled, aiGateInput } from "@/server/ai/gate";
import { isMailAvailable } from "@/server/auth/mailer";
import { getSessionUser, type SessionUser } from "@/server/auth/session";
import { getOffice } from "@/server/content/offices";
import { loadFlags } from "@/server/features";
import { MissingFixtureError } from "@/server/http/fixtures";
import { careerAiLinks } from "./ai-panels";
import type { AiStepLinks } from "./ai-result";
import { AiSummersPanel } from "./ai-summers";

/**
 * The career page's "Your AI summer picks" (owner request, 2026-11-02), right after the Summers and On campus
 * cards. Server component, decided on every request like the other AI panels (ai-panels.tsx):
 *
 *   - signed out, AI_ENABLED off or the careers section off → nothing is rendered;
 *   - otherwise the first gate failure of "career-summers" (aiGateInput: not_configured → unverified →
 *     consent_required) replaces the button, with its next step; the client island handles every AiResult kind
 *     the route answers later.
 *
 * Only the career slug and name, the gate, the next-step links and the Matthews Center's page (for "nothing
 * fits") reach the browser: the picks and their content arrive from the route.
 */

/** The Matthews Center's own page (curated, server/content/offices.ts). */
export const MATTHEWS_CENTER_SLUG = "matthews-center";

export interface CareerAiSummersView {
  gate: AiFailure | null;
  links: AiStepLinks;
}

/** Pure: what the panel shows for this student (null = nothing at all). */
export function careerAiSummersView(input: {
  careerSlug: string;
  user: Pick<SessionUser, "email" | "emailVerifiedAt"> | null;
  flags: Flags;
  gateInput: AiGateInput;
  mailAvailable: boolean;
}): CareerAiSummersView | null {
  if (!input.user || !aiFeatureEnabled(input.flags, "career-summers")) return null;
  return {
    gate: aiGateFailure({ ...input.gateInput, enabled: true }),
    links: careerAiLinks(input.careerSlug, input.user, input.mailAvailable),
  };
}

export async function CareerAiSummers({ career }: { career: Career }) {
  const user = await getSessionUser();
  if (!user) return null;
  const flags = loadFlags();
  if (!aiFeatureEnabled(flags, "career-summers")) return null;
  const office = getOffice(MATTHEWS_CENTER_SLUG);
  if (!office) return null;

  let gateInput: AiGateInput;
  try {
    gateInput = await aiGateInput(user.id, "career-summers");
  } catch (error) {
    // A bad AI env (getFlags in the gate) or an unreachable DB: no AI panel, the rest of the page stays up.
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    console.error("[careers] could not resolve the AI summers gate:", error);
    return null;
  }

  const view = careerAiSummersView({
    careerSlug: career.slug,
    user,
    flags,
    gateInput,
    mailAvailable: isMailAvailable(),
  });
  if (!view) return null;
  return (
    <SectionCard id="ai-summers" title="Your AI summer picks">
      <AiSummersPanel
        careerSlug={career.slug}
        careerName={career.name}
        gate={view.gate}
        links={view.links}
        adviceHref={office.url}
      />
    </SectionCard>
  );
}
