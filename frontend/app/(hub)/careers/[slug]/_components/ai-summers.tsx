"use client";

import * as React from "react";
import { Info, Sparkles } from "lucide-react";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { runHeads, SourceNote } from "@/components/ui/source-tag";
import { callApi } from "@/lib/api/client";
import { aiEndpoints } from "@/lib/api/endpoints";
import type { AiFailure, AiOk, CareerSummers, SummerOption } from "@/lib/types/ai";
import { cn } from "@/lib/utils";
import { formatContentDate } from "../../_lib/format";
import { ExternalLink } from "../../_components/external-link";
import { FOCUS_TARGET, useAiRequest, useSettleFocus } from "./ai-request";
import { aiFailureCopy, AiNotice, REGENERATION_HINT, type AiStepLinks } from "./ai-result";

/**
 * "Your AI summer picks" (owner request, 2026-11-02): POST /api/ai/career-summers { careerSlug, regenerate }
 * through callApi. The AI only chose options by id and wrote the outlook, each pick's "why" and its next step:
 * those are the AI's words and carry the AI chip. Everything else a pick shows (its name and page, who runs it,
 * who it is for, its timing or deadlines, when MakeItSo checked it) is the content's, attached by the server
 * (server/ai/summer-catalog.ts), and is said as the Summers card says it: the row's "via" note (once per run) and
 * the "For" / "Timing" lines. No picks means the AI found nothing that fits: the panel says so, with the outlook
 * and a pointer to the Matthews Center, instead of a padded list.
 *
 * Every failure kind gets its words and next step (ai-result.tsx); a gate failure known when the page rendered
 * (`gate`) replaces the button.
 */

export type SummersData = { summers: CareerSummers };

export interface AiSummersPanelProps {
  careerSlug: string;
  careerName: string;
  /** The first gate this student fails (not_configured / unverified / consent_required), or null. */
  gate: AiFailure | null;
  links: AiStepLinks;
  /** The Matthews Center's page (server/content/offices.ts), offered when nothing fits. */
  adviceHref: string;
}

/** A pick's "via" words, the Summers card's (career-activities.tsx summerLabel). */
export function pickLabel(option: SummerOption): string {
  return `via ${option.runBy}`;
}

/** "checked Oct 29, 2026", or "checked between Sep 30, 2026 and Oct 29, 2026" (as the Summers card says it). */
export function pickCheckedWords(options: readonly Pick<SummerOption, "verifiedAt">[]): string {
  const days = options.map((o) => o.verifiedAt).sort();
  if (days.length === 0) return "";
  const from = days[0]!;
  const to = days[days.length - 1]!;
  return from === to
    ? `checked ${formatContentDate(from)}`
    : `checked between ${formatContentDate(from)} and ${formatContentDate(to)}`;
}

function PickNote({
  option,
  label,
  hidden,
}: {
  option: SummerOption;
  label: string;
  hidden: boolean;
}) {
  if (option.source) {
    return <SourceNote source={option.source} label={label} hidden={hidden} className="text-xs" />;
  }
  // An outside program has no source id (lib/sources.ts): the same quiet words, without data-source.
  if (hidden) return <span className="sr-only">Source: {label}</span>;
  return (
    <span className="font-sans text-xs text-fg-3">
      <span className="sr-only">Source: </span>
      {label}
    </span>
  );
}

function PicksView({
  result,
  stale,
  adviceHref,
  focusRef,
}: {
  result: AiOk<SummersData>;
  stale: boolean;
  adviceHref: string;
  focusRef: React.Ref<HTMLDivElement>;
}) {
  const { outlook, picks } = result.data.summers;
  const labels = picks.map((pick) => pickLabel(pick.option));
  const heads = runHeads(labels);
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role="group"
      aria-label="Your AI summer picks"
      aria-busy={stale || undefined}
      className={cn("flex flex-col gap-4", FOCUS_TARGET)}
      data-testid="ai-summers-result"
    >
      {stale ? (
        <p className="text-sm font-semibold text-fg-2" data-testid="ai-summers-stale">
          Picking again… these stay until the new picks are ready.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
        <AiChip />
        {result.cached ? <span>Saved from your last request</span> : null}
        {result.fallbackUsed ? (
          <span>Answered by a backup model ({result.servedModel})</span>
        ) : null}
      </div>
      {outlook ? (
        <p className="max-w-prose text-base text-fg" data-testid="ai-summers-outlook">
          {outlook}
        </p>
      ) : null}

      {picks.length > 0 ? (
        <>
          <ol className="flex flex-col divide-y divide-line" data-testid="ai-summer-picks">
            {picks.map((pick, i) => (
              <li
                key={pick.option.id}
                className="py-3 first:pt-0 last:pb-0"
                data-source={pick.option.source ?? undefined}
                data-testid="ai-summer-pick"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ExternalLink href={pick.option.url} newTab>
                    {pick.option.name}
                  </ExternalLink>
                  <PickNote option={pick.option} label={labels[i]!} hidden={!heads[i]} />
                  {pick.option.onThisPage ? (
                    <span className="font-sans text-xs text-fg-3">· in Summers above</span>
                  ) : null}
                </div>
                <dl
                  className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm"
                  data-testid="ai-summer-facts"
                >
                  <dt className="font-semibold text-fg">Why it fits you</dt>
                  <dd className="min-w-0 text-fg" data-testid="ai-summer-why">
                    {pick.why}
                  </dd>
                  {pick.nextStep ? (
                    <>
                      <dt className="font-semibold text-fg">Next step</dt>
                      <dd className="min-w-0 text-fg" data-testid="ai-summer-next">
                        {pick.nextStep}
                      </dd>
                    </>
                  ) : null}
                  {pick.option.audience ? (
                    <>
                      <dt className="font-semibold text-fg">For</dt>
                      <dd className="min-w-0 text-fg-2">{pick.option.audience}</dd>
                    </>
                  ) : null}
                  {pick.option.timing ? (
                    <>
                      <dt className="font-semibold text-fg">{pick.option.timing.label}</dt>
                      <dd className="min-w-0 text-fg-2">{pick.option.timing.text}</dd>
                    </>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
          <p className="text-xs text-fg-3" data-testid="ai-summers-facts-line">
            “Why it fits you” and “Next step” are the AI’s; names, who each is for and timing are as
            each program publishes them · {pickCheckedWords(picks.map((p) => p.option))}. Confirm on
            the program’s page before you apply.
          </p>
        </>
      ) : (
        <div
          className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3.5 text-sm"
          data-testid="ai-summers-none"
        >
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-2" />
          <p className="text-fg-2">
            The AI found nothing in MakeItSo’s summer list that fits you well right now, so it
            picked none.{" "}
            <ExternalLink href={adviceHref} newTab>
              The Matthews Center
            </ExternalLink>{" "}
            can help you look further.
          </p>
        </div>
      )}
    </div>
  );
}

export function AiSummersPanel({
  careerSlug,
  careerName,
  gate,
  links,
  adviceHref,
}: AiSummersPanelProps) {
  const { state, run, busy } = useAiRequest<SummersData>(links);
  const { rootRef, resultRef, failureRef } = useSettleFocus(state.phase);

  const generate = (regenerate: boolean) => {
    if (busy) return;
    void run(() => callApi(aiEndpoints.careerSummers, { body: { careerSlug, regenerate } }));
  };

  if (gate) {
    return <AiNotice copy={aiFailureCopy(gate, links)} live={false} testId="ai-summers-gate" />;
  }

  const shown =
    state.phase === "ok"
      ? state.result
      : state.phase === "loading" || state.phase === "failed"
        ? state.previous
        : null;

  return (
    <div ref={rootRef} tabIndex={-1} className={cn("flex flex-col gap-4", FOCUS_TARGET)}>
      {shown === null ? (
        <div className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-fg-2">
            Summer programs and grants for {careerName}, picked by AI from the options MakeItSo
            lists, for your year, majors and interests. Your name and email are never sent to the
            AI.
          </p>
          <div>
            {/* Secondary: the page's one primary action is the career plan's. aria-disabled keeps focus. */}
            <Button
              variant="secondary"
              onClick={() => generate(false)}
              aria-disabled={busy || undefined}
            >
              <Sparkles aria-hidden />
              {busy ? "Picking summers for you…" : "Suggest summers for me"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <PicksView result={shown} stale={busy} adviceHref={adviceHref} focusRef={resultRef} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => generate(true)}
              aria-disabled={busy || undefined}
            >
              {busy ? "Picking…" : "Pick again"}
            </Button>
            <span className="text-xs text-fg-3">{REGENERATION_HINT}</span>
          </div>
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {state.phase === "loading" ? "Picking summers for you…" : ""}
        {state.phase === "ok" ? "Your summer picks are ready." : ""}
      </p>
      {state.phase === "failed" ? (
        <div ref={failureRef} tabIndex={-1} className={FOCUS_TARGET}>
          <AiNotice
            copy={state.copy}
            busy={busy}
            onRetry={() => generate(state.previous !== null)}
            testId="ai-summers-failure"
          />
        </div>
      ) : null}
    </div>
  );
}
