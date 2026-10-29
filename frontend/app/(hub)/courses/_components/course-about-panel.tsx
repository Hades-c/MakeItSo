"use client";

import * as React from "react";
import Link from "next/link";
import { Flag, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { useReportAboutOutcome, type AboutOutcome } from "./about-outcome";
import { WRAP_CHIP } from "./wrap";
import { Chip } from "@/components/ui/chip";
import type { CourseAboutResultSchema } from "@/lib/api/ai";
import { ApiClientError, callApi } from "@/lib/api/client";
import { aiEndpoints } from "@/lib/api/endpoints";
import { AI_FAILURE_MESSAGES, type AiFailureKind } from "@/lib/types/ai-constants";
import { formatMediumDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import type * as z from "zod";

/**
 * The AI "About this course" panel (PLAN §3 R2, §6.1 W6 course-about; §7: every AI output carries the AiChip).
 * POST /api/ai/course-about through callApi, which returns every AiResult kind instead of throwing: ok shows the
 * summary, "good for" and topics as plain text (never model-written prerequisites, difficulty or workload: W6
 * strips those) with the entry's provenance and a "Report this" link; every failure kind says what happened, with
 * Retry only where trying again can help. The server renders this island only while AI is on and configured;
 * `gate` says when the student must verify their Davidson mailbox or turn AI on first (nothing is requested then).
 * The "Verify your Davidson email" link shows only with `verifyHref` (server/auth verifyStepFor: an unverified
 * @davidson.edu address while mail can send a code); a legacy non-Davidson account gets the explanation alone.
 */

type Result = z.infer<typeof CourseAboutResultSchema>;
type Ok = Extract<Result, { kind: "ok" }>;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: Result }
  | { status: "error"; message: string };

/** Kinds where trying again later in the same view can help. */
export const RETRYABLE: ReadonlySet<AiFailureKind> = new Set([
  "truncated",
  "invalid",
  "timeout",
  "unavailable",
]);

export interface CourseAboutPanelProps {
  termCode: string;
  courseCode: string;
  gate: "ready" | "unverified" | "consent_required";
  /** With gate "unverified": the server's message (it depends on the AI_ALLOW_UNVERIFIED switch). */
  unverifiedMessage?: string;
  /** /verify?reason=davidson&next=… for an unverified @davidson.edu account, else null. */
  verifyHref?: string | null;
  timeZone?: string;
  /**
   * Where the panel sits (course-view.tsx): "lead" when the summary leads the page (the requirements card follows
   * it and the official description is last, unless the panel fails); "after" in the gated order, after Sections,
   * below the official About card. The summary's footer says where the official text is from there.
   */
  placement?: "lead" | "after";
}

function Heading() {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2
        id="about-ai-title"
        className="flex items-center gap-2 font-display text-lg font-strong tracking-title text-fg"
      >
        <Sparkles aria-hidden className="size-4.5 text-taupe" />
        About this course
      </h2>
      <span className="flex items-center gap-2">
        <AiChip />
      </span>
    </div>
  );
}

const GATE_LINK = "inline-flex min-h-11 items-center font-semibold link md:min-h-0";

function GateNotice({
  gate,
  message,
  verifyHref,
}: {
  gate: "unverified" | "consent_required";
  /** The server's words for this gate; default AI_FAILURE_MESSAGES[gate]. */
  message?: string;
  verifyHref: string | null;
}) {
  const step =
    gate === "consent_required" ? (
      <Link href={routes.profile()} className={GATE_LINK}>
        Turn on AI features in your profile
      </Link>
    ) : verifyHref ? (
      <Link href={verifyHref} className={GATE_LINK}>
        Verify your Davidson email
      </Link>
    ) : null;
  return (
    <div className="text-sm text-fg-2" data-testid="about-gate">
      <p>{message?.trim() || AI_FAILURE_MESSAGES[gate]}</p>
      {step ? <p className="mt-2">{step}</p> : null}
    </div>
  );
}

function ReportLink({ inputHash }: { inputHash: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle");
  const report = async () => {
    setState("sending");
    try {
      await callApi(aiEndpoints.report, { body: { feature: "course-about", key: inputHash } });
      setState("sent");
    } catch {
      setState("failed");
    }
  };
  if (state === "sent") {
    return (
      <p role="status" className="text-xs text-fg-2">
        Thanks. Reported summaries are reviewed, and hidden after several reports.
      </p>
    );
  }
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void report()}
        aria-disabled={state === "sending" || undefined}
      >
        <Flag aria-hidden />
        Report this summary
      </Button>
      {/* An icon and words, never the danger colour alone (red is also the accent). */}
      {state === "failed" ? (
        <FieldError role="status">Could not send the report. Try again.</FieldError>
      ) : null}
    </div>
  );
}

/** The footer's pointer to the official text, from where the panel sits. */
export function OfficialPointer({ placement }: { placement: "lead" | "after" }) {
  return placement === "lead" ? (
    <>
      The requirements and prerequisites below, and the{" "}
      <a href="#official-description" className="link">
        official description
      </a>{" "}
      at the end of the page, are the official ones.
    </>
  ) : (
    <>The description, requirements and prerequisites above are the official ones.</>
  );
}

function OkView({
  result,
  timeZone,
  placement,
}: {
  result: Ok;
  timeZone?: string;
  placement: "lead" | "after";
}) {
  const { about, provenance } = result.data;
  const generated = new Date(provenance.generatedAt);
  return (
    <div className="flex flex-col gap-3" data-testid="about-ok">
      <p className="text-base leading-relaxed text-fg">{about.summary}</p>
      {about.goodFor.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-fg">Good for students who…</h3>
          <ul className="list-disc pl-5 text-sm text-fg-2">
            {about.goodFor.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {about.topics.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-fg">Topics</h3>
          <ul className="flex flex-wrap gap-1.5">
            {about.topics.map((topic) => (
              <li key={topic}>
                <Chip variant="neutral" className={WRAP_CHIP}>
                  {topic}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-xs text-fg-3" data-testid="about-official-pointer">
          Summarized from the official course description
          {Number.isNaN(generated.getTime())
            ? ""
            : ` on ${formatMediumDate(generated, timeZone)}`}.{" "}
          <OfficialPointer placement={placement} />
        </p>
        <ReportLink inputHash={provenance.inputHash} />
      </div>
    </div>
  );
}

export function CourseAboutPanel({
  termCode,
  courseCode,
  gate,
  unverifiedMessage,
  verifyHref = null,
  timeZone,
  placement = "after",
}: CourseAboutPanelProps) {
  const [state, setState] = React.useState<State>({
    status: gate === "ready" ? "loading" : "idle",
  });

  const request = React.useCallback(async (): Promise<State> => {
    try {
      const result = await callApi(aiEndpoints.courseAbout, { body: { termCode, courseCode } });
      return { status: "done", result };
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof ApiClientError && error.status === 429
            ? "Too many AI requests right now. Try again in a minute."
            : error instanceof ApiClientError && error.status === 401
              ? "Your session has ended. Sign in again to see the AI summary."
              : "The AI summary could not be loaded. Try again.",
      };
    }
  }, [termCode, courseCode]);

  React.useEffect(() => {
    if (gate !== "ready") return;
    let live = true;
    void request().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [gate, request]);

  const load = () => {
    setState({ status: "loading" });
    void request().then(setState);
  };

  // How the request settled, for the page's layout (about-outcome.tsx): only the summary itself is "ok".
  const outcome: AboutOutcome | null =
    gate !== "ready"
      ? null
      : state.status === "done"
        ? state.result.kind === "ok"
          ? "ok"
          : "failed"
        : state.status === "error"
          ? "failed"
          : "pending";
  useReportAboutOutcome(outcome);

  let body: React.ReactNode;
  if (gate !== "ready") {
    body = (
      <GateNotice
        gate={gate}
        message={gate === "unverified" ? unverifiedMessage : undefined}
        verifyHref={verifyHref}
      />
    );
  } else if (state.status === "idle" || state.status === "loading") {
    body = (
      <p role="status" className="flex items-center gap-2 text-sm text-fg-2">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Loading the AI summary…
      </p>
    );
  } else if (state.status === "error") {
    body = (
      <div role="alert" className="text-sm text-fg-2" data-testid="about-error">
        <p>{state.message}</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={load}>
          <RotateCcw aria-hidden />
          Retry
        </Button>
      </div>
    );
  } else if (state.result.kind === "ok") {
    body = <OkView result={state.result} timeZone={timeZone} placement={placement} />;
  } else {
    const { kind, message } = state.result;
    if (kind === "disabled" || kind === "not_configured") {
      // AI was switched off since the page rendered: say so once, quietly.
      body = (
        <p className="text-sm text-fg-2" data-testid="about-failure" data-kind={kind}>
          {message}
        </p>
      );
    } else if (kind === "unverified" || kind === "consent_required") {
      body = <GateNotice gate={kind} message={message} verifyHref={verifyHref} />;
    } else {
      body = (
        <div
          role="alert"
          className="text-sm text-fg-2"
          data-testid="about-failure"
          data-kind={kind}
        >
          <p>{message}</p>
          {RETRYABLE.has(kind) ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={load}>
              <RotateCcw aria-hidden />
              Retry
            </Button>
          ) : null}
        </div>
      );
    }
  }

  return (
    <section
      aria-labelledby="about-ai-title"
      data-testid="course-about-ai"
      className="min-w-0 rounded-xl border border-dashed border-line-strong bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5"
    >
      <Heading />
      {body}
    </section>
  );
}
