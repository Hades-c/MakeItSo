"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Plus, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { EmptyState } from "@/components/ui/empty-state";
import { controlClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SourceTag } from "@/components/ui/source-tag";
import { aiApi } from "@/lib/api/ai";
import { callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import { formatMediumDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import { termLabel } from "@/lib/term";
import type { PlanDraft, PlanItem } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { errorMessage, isConflict } from "../_lib/errors";
import {
  allHandled,
  closingStatus,
  draftTerms,
  orderDrafts,
  type SuggestionRow,
} from "../_lib/suggestions";
import { Notice } from "./notice";
import { usePlanAction } from "./use-plan-action";

/**
 * AI plan suggestions (R2): drafts the AI wrote for a term (server/ai → server/plan saveDraft), accepted or set
 * aside one course at a time. "Add to plan" adds that course (POST /api/plan/items, source ai-draft); "Not for
 * me" sets it aside. A term is never hidden: every term of a draft stays listed with each course's state, and a
 * course already in the plan is ticked off. Once every course is handled the draft can be closed (PATCH
 * /api/plan/drafts/[id]). Every AI text carries the "AI · verify with your advisor" chip and is plain text.
 */

export interface SuggestionsPanelProps {
  drafts: readonly PlanDraft[];
  items: readonly PlanItem[];
  targetTerms: readonly string[];
  registration: string;
  timeZone: string;
}

function DraftCard({
  draft,
  items,
  timeZone,
}: {
  draft: PlanDraft;
  items: readonly PlanItem[];
  timeZone: string;
}) {
  const [rejected, setRejected] = React.useState<ReadonlySet<string>>(new Set());
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState<ReadonlySet<string>>(new Set());
  const action = usePlanAction();
  const terms = draftTerms(draft, items, rejected).map((term) => ({
    ...term,
    rows: term.rows.map((row) =>
      row.state === "pending" && added.has(row.key) ? { ...row, state: "in-plan" as const } : row,
    ),
  }));
  const handled = allHandled(terms);
  const pendingCount = terms
    .flatMap((term) => term.rows)
    .filter((row) => row.state === "pending").length;

  const accept = async (row: SuggestionRow) => {
    setBusyKey(row.key);
    const result = await action.run(
      () =>
        callApi(planApi.addItem, {
          body: { termCode: row.termCode, courseCode: row.courseCode, source: "ai-draft" },
        }),
      {
        fallback: `Could not add ${row.courseCode}. Please try again.`,
        // Already in the plan for that term: it counts as accepted.
        onError: (error) => {
          if (!isConflict(error)) return false;
          setAdded((previous) => new Set(previous).add(row.key));
          return true;
        },
      },
    );
    setBusyKey(null);
    if (result.ok) {
      setAdded((previous) => new Set(previous).add(row.key));
      toast.success(`Added ${row.courseCode} to ${termLabel(row.termCode)}.`);
      for (const warning of result.value.warnings) toast.warning(warning.message);
    }
  };

  const close = async (status: "accepted" | "dismissed") => {
    const result = await action.run(
      () => callApi(planApi.updateDraft, { params: { id: draft.id }, body: { status } }),
      { fallback: "Could not close these suggestions. Please try again." },
    );
    if (result.ok)
      toast.success(status === "accepted" ? "Suggestions closed." : "Suggestions dismissed.");
  };

  return (
    <article
      aria-labelledby={`draft-${draft.id}`}
      className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5"
      data-testid="suggestion-draft"
      data-source="ai"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`draft-${draft.id}`} className="text-lg font-strong tracking-title text-fg">
          Suggestions from {formatMediumDate(draft.createdAt, timeZone)}
        </h3>
        <span className="flex items-center gap-2">
          <SourceTag source="ai" />
          <AiChip />
        </span>
      </div>
      <ol className="mt-3 flex flex-col gap-4">
        {terms.map((term) => (
          <li key={term.termCode}>
            <section aria-labelledby={`draft-${draft.id}-${term.termCode}`}>
              <h4
                id={`draft-${draft.id}-${term.termCode}`}
                className="text-sm font-semibold tracking-label text-fg-3 uppercase"
              >
                {term.label}
              </h4>
              <ul className="mt-2 flex flex-col gap-2">
                {term.rows.map((row) => (
                  <li
                    key={row.key}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border border-line px-3 py-2.5 sm:flex-row sm:items-start",
                      row.state !== "pending" && "bg-surface-2",
                    )}
                    data-testid="suggestion"
                    data-state={row.state}
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={routes.course(row.termCode, row.courseCode)}
                        className="rounded-xs underline-offset-2 hover:underline"
                      >
                        <CourseCode code={row.courseCode} size="md" />
                      </Link>
                      <p className="mt-1 text-sm text-fg-2">{row.reason}</p>
                      {row.basisNote ? (
                        <p className="mt-1 text-xs text-fg-3">{row.basisNote}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {row.state === "in-plan" ? (
                        <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-success md:min-h-0">
                          <Check aria-hidden className="size-4" /> In your plan
                        </span>
                      ) : row.state === "rejected" ? (
                        <>
                          <span className="text-sm text-fg-2">Set aside</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setRejected((previous) => {
                                const next = new Set(previous);
                                next.delete(row.key);
                                return next;
                              })
                            }
                          >
                            <Undo2 aria-hidden />
                            Undo <span className="sr-only">for {row.courseCode}</span>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyKey !== null}
                            onClick={() => void accept(row)}
                          >
                            {busyKey === row.key ? (
                              <LoaderCircle
                                aria-hidden
                                className="animate-spin motion-reduce:animate-none"
                              />
                            ) : (
                              <Plus aria-hidden />
                            )}
                            Add to plan{" "}
                            <span className="sr-only">
                              : {row.courseCode} in {term.label}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyKey !== null}
                            onClick={() =>
                              setRejected((previous) => new Set(previous).add(row.key))
                            }
                          >
                            <X aria-hidden />
                            Not for me <span className="sr-only">: {row.courseCode}</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </li>
        ))}
      </ol>
      <div aria-live="polite" className="mt-3">
        <Notice tone="error">{action.error}</Notice>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {handled ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={action.busy}
            onClick={() => void close(closingStatus(terms))}
          >
            Done with these suggestions
          </Button>
        ) : (
          <p className="text-sm text-fg-2">
            {pendingCount} {pendingCount === 1 ? "course" : "courses"} to decide on.
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={action.busy}
          onClick={() => void close("dismissed")}
        >
          Dismiss all
        </Button>
      </div>
    </article>
  );
}

export function SuggestionsPanel({
  drafts,
  items,
  targetTerms,
  registration,
  timeZone,
}: SuggestionsPanelProps) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const id = React.useId();
  const [term, setTerm] = React.useState(
    targetTerms.includes(registration) ? registration : (targetTerms[0] ?? registration),
  );
  const [state, setState] = React.useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "failed"; message: string }
  >({ kind: "idle" });
  const pending = orderDrafts(drafts).filter((draft) => draft.status === "pending");
  const existing = pending.some((draft) => draft.items.some((entry) => entry.termCode === term));

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ kind: "loading" });
    try {
      const result = await callApi(aiApi.planSuggestions, {
        body: { termCode: term, regenerate: existing },
      });
      if (result.kind === "ok") {
        setState({ kind: "idle" });
        startTransition(() => router.refresh());
      } else {
        setState({ kind: "failed", message: result.message });
      }
    } catch (error) {
      setState({
        kind: "failed",
        message: errorMessage(error, "Suggestions could not be made. Please try again."),
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(event) => void generate(event)}
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-end md:px-5"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-term`}>Suggest courses for</Label>
          <select
            id={`${id}-term`}
            className={cn(controlClass, "h-11 px-3 md:h-10")}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          >
            {targetTerms.map((code) => (
              <option key={code} value={code}>
                {termLabel(code)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={state.kind === "loading" || targetTerms.length === 0}>
          {state.kind === "loading" ? (
            <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Sparkles aria-hidden />
          )}
          {existing ? "Suggest again" : "Get suggestions"}
        </Button>
      </form>
      <div aria-live="polite">
        {state.kind === "loading" ? (
          <p className="text-sm text-fg-2">
            Asking the AI for courses from the {termLabel(term)} catalog…
          </p>
        ) : state.kind === "failed" ? (
          <Notice tone="error">{state.message}</Notice>
        ) : null}
      </div>
      {pending.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No suggestions yet"
          description={
            <p>
              The AI suggests real courses from the Davidson schedule that fill your open
              requirements. You decide on each one; nothing is added without you.
            </p>
          }
        />
      ) : (
        pending.map((draft) => (
          <DraftCard key={draft.id} draft={draft} items={items} timeZone={timeZone} />
        ))
      )}
    </div>
  );
}
