"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { aiApi } from "@/lib/api/ai";
import { ApiClientError, callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import type { TermCode } from "@/lib/term";
import type { AiFailure, AiOk, CareerPlan } from "@/lib/types/ai";
import type { PlanDraft } from "@/lib/types/plan";
import { AiCoursePicks } from "./ai-course-picks";
import { useAiRequest } from "./ai-request";
import { aiFailureCopy, AiNotice, type AiStepLinks } from "./ai-result";

/**
 * "Your AI career plan" (PLAN §3 /careers/[slug], §6.1 W6 feature 3): POST /api/ai/career-plan { careerSlug,
 * regenerate } through callApi, rendered as text with the AI chip. The plan: an overview, official majors/minors
 * to consider, course picks (official titles + live availability, ai-course-picks.tsx) and experiences.
 *
 * "Send to my plan": the route stores the picks as a pending "career-plan" PlanDraft (W6 + W5s); the button
 * checks that draft with GET /api/plan/drafts and opens My plan → Suggestions, where the student accepts or
 * dismisses it. Nothing is added to the plan from here. A draft the student already accepted or dismissed says so.
 *
 * Every failure kind gets its words and next step (ai-result.tsx); a gate failure known when the page rendered
 * (`gate`) replaces the button, so nobody spends a click to learn that AI is off for them.
 */

export type CareerPlanData = { plan: CareerPlan; draft: PlanDraft | null };

export interface AiCareerPlanPanelProps {
  careerSlug: string;
  careerName: string;
  /** The first gate this student fails (not_configured / unverified / consent_required), or null. */
  gate: AiFailure | null;
  links: AiStepLinks;
  careerTerms: readonly TermCode[];
  /** /plan?tab=suggestions */
  suggestionsHref: string;
}

type SendState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "sent" }
  | { phase: "done"; text: string }
  | { phase: "error"; text: string };

/** What GET /api/plan/drafts says about the draft this plan made (exported for tests). */
export function draftSendOutcome(
  drafts: readonly PlanDraft[],
  draftId: string,
): "pending" | "accepted" | "dismissed" | "missing" {
  const found = drafts.find((d) => d.id === draftId);
  return found ? found.status : "missing";
}

export function sendErrorText(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 401) {
    return "Your session has ended. Sign in again to send this plan.";
  }
  return "My plan couldn’t be reached. Please try again.";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function SendToPlan({ draft, suggestionsHref }: { draft: PlanDraft; suggestionsHref: string }) {
  const router = useRouter();
  const [send, setSend] = React.useState<SendState>({ phase: "idle" });

  async function onSend() {
    if (send.phase === "checking") return;
    setSend({ phase: "checking" });
    try {
      const { drafts } = await callApi(planApi.listDrafts);
      const outcome = draftSendOutcome(drafts, draft.id);
      if (outcome === "pending") {
        setSend({ phase: "sent" });
        router.push(suggestionsHref);
        return;
      }
      setSend({
        phase: "done",
        text:
          outcome === "accepted"
            ? "You already added this plan’s courses in My plan."
            : outcome === "dismissed"
              ? "You dismissed this draft in My plan. Draft a new plan to get fresh picks."
              : "This draft is no longer in My plan. Draft a new plan to get fresh picks.",
      });
    } catch (error) {
      setSend({ phase: "error", text: sendErrorText(error) });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3.5">
      <p className="text-sm text-fg-2">
        {plural(draft.items.length, "course", "courses")} wait as a draft in{" "}
        <Link href={suggestionsHref} className="font-semibold text-primary hover:underline">
          My plan → Suggestions
        </Link>
        . Nothing is added to your plan until you accept it there.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void onSend()} disabled={send.phase === "checking"}>
          Send to my plan
        </Button>
      </div>
      <p aria-live="polite" className="text-sm text-fg-2" data-testid="ai-send-status">
        {send.phase === "checking"
          ? "Checking My plan…"
          : send.phase === "sent"
            ? "Sent. Opening My plan → Suggestions…"
            : send.phase === "done" || send.phase === "error"
              ? send.text
              : ""}
      </p>
    </div>
  );
}

function PlanView({
  result,
  careerTerms,
  suggestionsHref,
}: {
  result: AiOk<CareerPlanData>;
  careerTerms: readonly TermCode[];
  suggestionsHref: string;
}) {
  const { plan, draft } = result.data;
  return (
    <div className="flex flex-col gap-5" data-testid="ai-career-plan-result">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
        <AiChip />
        {result.cached ? <span>Saved from your last request</span> : null}
        {result.fallbackUsed ? (
          <span>Answered by a backup model ({result.servedModel})</span>
        ) : null}
      </div>
      <p className="max-w-prose text-base text-fg" data-testid="ai-plan-overview">
        {plan.overview}
      </p>

      {plan.majors.length > 0 || plan.minors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-strong text-fg">Programs to consider</h3>
          <ul className="flex flex-wrap gap-2" aria-label="Majors and minors to consider">
            {plan.majors.map((name) => (
              <li key={`major:${name}`}>
                <Chip variant="neutral">Major · {name}</Chip>
              </li>
            ))}
            {plan.minors.map((name) => (
              <li key={`minor:${name}`}>
                <Chip variant="neutral">Minor · {name}</Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-strong text-fg">Courses</h3>
        {plan.courses.length > 0 ? (
          <AiCoursePicks picks={plan.courses} draft={draft} careerTerms={careerTerms} />
        ) : (
          <p className="text-sm text-fg-2">No catalog courses to suggest for you right now.</p>
        )}
      </div>

      {plan.experiences.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-strong text-fg">Experiences</h3>
          <ul className="flex flex-col gap-2" data-testid="ai-experiences">
            {plan.experiences.map((experience) => (
              <li
                key={`${experience.title}:${experience.when}`}
                className="rounded-lg border border-line bg-bg p-3.5 text-sm"
              >
                <p className="font-semibold text-fg">{experience.title}</p>
                <p className="text-xs text-fg-3">{experience.when}</p>
                <p className="mt-1 text-fg-2">{experience.why}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {draft && draft.items.length > 0 ? (
        <SendToPlan draft={draft} suggestionsHref={suggestionsHref} />
      ) : null}
    </div>
  );
}

export function AiCareerPlanPanel({
  careerSlug,
  careerName,
  gate,
  links,
  careerTerms,
  suggestionsHref,
}: AiCareerPlanPanelProps) {
  const { state, run, busy } = useAiRequest<CareerPlanData>(links);

  const generate = (regenerate: boolean) =>
    void run(() => callApi(aiApi.careerPlan, { body: { careerSlug, regenerate } }));

  if (gate) {
    return <AiNotice copy={aiFailureCopy(gate, links)} live={false} testId="ai-plan-gate" />;
  }

  const shown =
    state.phase === "ok"
      ? state.result
      : state.phase === "loading" || state.phase === "failed"
        ? state.previous
        : null;

  return (
    <div className="flex flex-col gap-4">
      {shown === null ? (
        <div className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-fg-2">
            A starting plan for {careerName}: courses from the Davidson catalog, programs and
            experiences, based on your major, graduation year and plan. Your name and email are
            never sent to the AI.
          </p>
          <div>
            <Button onClick={() => generate(false)} disabled={busy}>
              <Sparkles aria-hidden />
              {busy ? "Drafting your plan…" : "Draft my career plan"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <PlanView result={shown} careerTerms={careerTerms} suggestionsHref={suggestionsHref} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => generate(true)} disabled={busy}>
              {busy ? "Drafting…" : "Draft a new plan"}
            </Button>
            <span className="text-xs text-fg-3">Up to 3 new plans a day.</span>
          </div>
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {state.phase === "loading" ? "Drafting your career plan…" : ""}
        {state.phase === "ok" ? "Your career plan is ready." : ""}
      </p>
      {state.phase === "failed" ? (
        <AiNotice
          copy={state.copy}
          busy={busy}
          onRetry={() => generate(state.previous !== null)}
          testId="ai-plan-failure"
        />
      ) : null}
    </div>
  );
}
