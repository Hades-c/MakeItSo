import { unstable_rethrow } from "next/navigation";
import { AiChip } from "@/components/ui/ai-chip";
import { SectionCard } from "@/components/ui/section-card";
import { isDavidsonEmail } from "@/lib/api/account";
import type { Flags } from "@/lib/flags";
import { routes } from "@/lib/routes";
import type { TermCode } from "@/lib/term";
import { aiGateFailure, type AiFailure, type AiGateInput } from "@/lib/types/ai";
import type { Alumnus, Career } from "@/lib/types/content";
import { aiFeatureEnabled, aiGateInput } from "@/server/ai/gate";
import { isMailAvailable } from "@/server/auth/mailer";
import {
  getSessionUser,
  isEmailVerified,
  isVerifiedDavidsonUser,
  verifiedOnlyRedirect,
  type SessionUser,
} from "@/server/auth/session";
import { alumniForCareer } from "@/server/content/alumni";
import { featureEnabled, loadFlags } from "@/server/features";
import { MissingFixtureError } from "@/server/http/fixtures";
import { careerTermCodes } from "../../_lib/availability";
import { loadCareerTerms } from "../../_lib/catalog";
import { AiCareerPlanPanel } from "./ai-career-plan";
import { AiColdEmailPanel, type ColdEmailAlumnus } from "./ai-cold-email";
import { AiNotice, aiFailureCopy, type AiStepLinks } from "./ai-result";

/**
 * The career page's AI panels (PLAN §3 /careers/[slug], R2): "Your AI career plan" and "Email an alumnus". Server
 * component; decides on every request what this student may see, and hands the client islands only that:
 *
 *   - signed out, AI_ENABLED off (or the section's flag off: careers for the plan, alumni for the e-mail) → the
 *     panel is not rendered at all;
 *   - otherwise the first gate failure (lib/types/ai.ts aiGateFailure: not_configured → unverified →
 *     consent_required) is shown in place of the button, with its next step (verify / AI settings); the client
 *     still handles every AiResult kind the route may answer later (quota, budget, refused, ...);
 *   - the alumni list reaches the browser only for a verified @davidson.edu account while the Alumni section is on,
 *     and only CONTACTABLE alumni (contactable=false: public figures, trustees, college officers — never offered).
 *
 * The student's own name is passed to the cold e-mail island to fill {{studentName}} in the browser; the AI route
 * never sends it to the model (server/ai/payloads.ts).
 */

export interface CareerAiView {
  links: AiStepLinks;
  studentName: string;
  /** One notice for both panels when they fail the same gate (say it once). */
  sharedGate: AiFailure | null;
  plan: { gate: AiFailure | null } | null;
  email: { gate: AiFailure | null; alumni: ColdEmailAlumnus[] } | null;
}

export interface CareerAiViewInput {
  careerSlug: string;
  user: Pick<SessionUser, "email" | "name" | "emailVerifiedAt"> | null;
  flags: Flags;
  /** aiGateInput(user, "career-plan"): the account's verified/consented state. */
  gateInput: AiGateInput;
  mailAvailable: boolean;
  /** alumniForCareer(careerSlug). */
  alumni: readonly Alumnus[];
}

/** The contactable alumni of a career, reduced to what the picker shows. */
export function coldEmailAlumni(alumni: readonly Alumnus[]): ColdEmailAlumnus[] {
  return alumni
    .filter((alumnus) => alumnus.contactable)
    .map((alumnus) => ({
      id: alumnus.id,
      name: alumnus.name,
      classYear: alumnus.classYear,
      role: alumnus.role,
      organization: alumnus.organization,
      contactable: true as const,
    }));
}

/** Pure: what the panels show for this student (null = nothing at all). */
export function careerAiView(input: CareerAiViewInput): CareerAiView | null {
  const { user, flags, gateInput } = input;
  if (!user) return null;
  const planEnabled = aiFeatureEnabled(flags, "career-plan");
  const emailEnabled = aiFeatureEnabled(flags, "cold-email");
  if (!planEnabled && !emailEnabled) return null;

  const page = routes.career(input.careerSlug);
  const links: AiStepLinks = {
    verify:
      isDavidsonEmail(user.email) && !isEmailVerified(user) && input.mailAvailable
        ? verifiedOnlyRedirect(page)
        : null,
    consent: `${routes.profile()}#ai-features`,
    signIn: routes.login(page),
  };

  const planGate = planEnabled ? aiGateFailure({ ...gateInput, enabled: true }) : null;
  const emailGate = emailEnabled ? aiGateFailure({ ...gateInput, enabled: true }) : null;
  // Alumni data only for verified @davidson.edu accounts while the Alumni section is on (PLAN §1).
  const alumniOpen = featureEnabled(flags, "alumni") && isVerifiedDavidsonUser(user);
  const alumni = emailEnabled && alumniOpen ? coldEmailAlumni(input.alumni) : [];

  const sharedGate =
    planEnabled && emailEnabled && planGate && emailGate && planGate.kind === emailGate.kind
      ? planGate
      : null;

  return {
    links,
    studentName: user.name,
    sharedGate,
    plan: planEnabled ? { gate: planGate } : null,
    email: emailEnabled ? { gate: emailGate, alumni } : null,
  };
}

async function loadTermCodes(): Promise<TermCode[]> {
  const terms = await loadCareerTerms();
  return terms ? careerTermCodes(terms) : [];
}

const GRID = "grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]";

function Title({ children }: { children: string }) {
  return (
    <>
      {children}
      <AiChip label="verify with your advisor" className="font-medium" />
    </>
  );
}

export async function CareerAiPanels({ career }: { career: Career }) {
  const user = await getSessionUser();
  if (!user) return null;
  const flags = loadFlags();
  if (!aiFeatureEnabled(flags, "career-plan") && !aiFeatureEnabled(flags, "cold-email")) {
    return null;
  }

  let gateInput: AiGateInput;
  try {
    gateInput = await aiGateInput(user.id, "career-plan");
  } catch (error) {
    // A bad AI env (getFlags in the gate) or an unreachable DB: no AI panels, the rest of the page stays up.
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    console.error("[careers] could not resolve the AI gate:", error);
    return null;
  }

  const view = careerAiView({
    careerSlug: career.slug,
    user,
    flags,
    gateInput,
    mailAvailable: isMailAvailable(),
    alumni: alumniForCareer(career.slug),
  });
  if (!view) return null;
  const careerTerms = view.plan && !view.plan.gate ? await loadTermCodes() : [];

  if (view.sharedGate) {
    return (
      <SectionCard id="career-ai" title={<Title>AI for this path</Title>}>
        <AiNotice
          copy={aiFailureCopy(view.sharedGate, view.links)}
          live={false}
          testId="ai-shared-gate"
        />
      </SectionCard>
    );
  }

  return (
    <div className={GRID} data-testid="career-ai">
      {view.plan ? (
        <SectionCard id="ai-career-plan" title={<Title>Your AI career plan</Title>}>
          <AiCareerPlanPanel
            careerSlug={career.slug}
            careerName={career.name}
            gate={view.plan.gate}
            links={view.links}
            careerTerms={careerTerms}
            suggestionsHref={routes.plan("suggestions")}
          />
        </SectionCard>
      ) : null}
      {view.email ? (
        <SectionCard id="ai-cold-email" title={<Title>Email an alumnus</Title>}>
          <AiColdEmailPanel
            careerSlug={career.slug}
            alumni={view.email.alumni}
            studentName={view.studentName}
            gate={view.email.gate}
            links={view.links}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
