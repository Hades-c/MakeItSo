"use client";

import * as React from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { ProvenanceLine } from "@/app/(hub)/alumni/_components/provenance-line";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { aiApi } from "@/lib/api/ai";
import { callApi } from "@/lib/api/client";
import type { AiFailure, AiOk, ColdEmail } from "@/lib/types/ai";
import { cn } from "@/lib/utils";
import { FOCUS_TARGET, useAiRequest, useSettleFocus } from "./ai-request";
import { aiFailureCopy, AiNotice, REGENERATION_HINT, type AiStepLinks } from "./ai-result";

/**
 * Cold e-mail to an alumnus on this path (PLAN §1 "Alumni", §6.1 W6 feature 4): the student picks one of the
 * CONTACTABLE verified alumni the server listed (public figures, trustees and college officers are never offered:
 * contactable=false), and POST /api/ai/cold-email { alumnusId, careerSlug, regenerate } drafts it. The draft keeps
 * the literal {{studentName}}; this component fills it in the browser from the signed-in student's name, so the
 * name never reaches the server's AI request. A copy button puts subject + body on the clipboard.
 */

export interface ColdEmailAlumnus {
  id: string;
  name: string;
  classYear: number | null;
  role: string | null;
  organization: string | null;
  /** Always true: the server lists contactable alumni only (kept on the type so the rule is visible here). */
  contactable: true;
}

export interface AiColdEmailPanelProps {
  careerSlug: string;
  alumni: readonly ColdEmailAlumnus[];
  /** The signed-in student's name (for {{studentName}}). */
  studentName: string;
  gate: AiFailure | null;
  links: AiStepLinks;
  /** ALUMNI_CHECKED_AT, for the provenance line every alumni view carries (PLAN §1 "Alumni"). */
  checkedAt: string;
}

/** The answer, with the alumnus it was drafted for (so switching the picker never relabels an old draft). */
type EmailData = { email: ColdEmail; alumnusId: string };

const PLACEHOLDER_PATTERN = /\{\{\s*studentName\s*\}\}/g;
/** What the draft says where the name goes when the account has no usable name. */
export const NAME_FALLBACK = "[Your name]";

/** Fill every {{studentName}} with the student's name (trimmed; a fallback when empty). */
export function fillStudentName(text: string, name: string): string {
  const clean = name.replace(/\s+/g, " ").trim() || NAME_FALLBACK;
  return text.replace(PLACEHOLDER_PATTERN, () => clean);
}

/** The filled e-mail and the text the copy button copies. */
export function filledEmail(email: ColdEmail, name: string) {
  const subject = fillStudentName(email.subject, name);
  const body = fillStudentName(email.body, name);
  return { subject, body, clipboard: `Subject: ${subject}\n\n${body}` };
}

/** Only contactable alumni (defensive: the server already filters). */
export function contactableOnly<T extends { contactable: boolean }>(alumni: readonly T[]): T[] {
  return alumni.filter((alumnus) => alumnus.contactable === true);
}

function SeeLinkedIn() {
  return <span className="text-fg-3 italic">see LinkedIn</span>;
}

/**
 * The picker's line under a name: role, organization and class year. A field whose only source is LinkedIn is
 * null in the data and says "see LinkedIn" (lib/types/content.ts AlumnusSchema, as AlumnusCard does).
 */
function AlumnusFacts({ alumnus }: { alumnus: ColdEmailAlumnus }) {
  return (
    <span className="text-xs text-fg-2" data-testid="ai-email-alumnus-facts">
      {alumnus.role ?? <SeeLinkedIn />}, {alumnus.organization ?? <SeeLinkedIn />} · Class of{" "}
      {alumnus.classYear ?? <SeeLinkedIn />}
    </span>
  );
}

function CopyEmailButton({ text }: { text: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const fallback = React.useRef<HTMLTextAreaElement>(null);
  const fallbackId = React.useId();
  React.useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);
  // The clipboard was refused: hand the student the whole email in one field, already selected.
  React.useEffect(() => {
    if (state !== "failed") return;
    fallback.current?.focus();
    fallback.current?.select();
  }, [state]);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div>
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {state === "copied" ? "Copied" : "Copy email"}
        </Button>
      </div>
      <p aria-live="polite" className="text-xs text-fg-2" data-testid="ai-copy-status">
        {state === "copied"
          ? "The email is on your clipboard."
          : state === "failed"
            ? "Your browser didn’t allow copying. The email is selected below: copy it from there."
            : ""}
      </p>
      {state === "failed" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={fallbackId} className="text-xs font-semibold text-fg">
            Email text
          </label>
          <textarea
            id={fallbackId}
            ref={fallback}
            readOnly
            value={text}
            rows={8}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-line-strong bg-bg p-2.5 text-sm text-fg"
            data-testid="ai-copy-fallback"
          />
        </div>
      ) : null}
    </div>
  );
}

export function AiColdEmailPanel({
  careerSlug,
  alumni,
  studentName,
  gate,
  links,
  checkedAt,
}: AiColdEmailPanelProps) {
  const options = React.useMemo(() => contactableOnly(alumni), [alumni]);
  const [selected, setSelected] = React.useState<string | null>(options[0]?.id ?? null);
  const { state, run, busy } = useAiRequest<EmailData>(links);
  const { rootRef, resultRef, failureRef } = useSettleFocus(state.phase);
  const lastRequest = React.useRef<{ alumnusId: string; regenerate: boolean } | null>(null);
  const groupId = React.useId();

  if (gate) {
    return <AiNotice copy={aiFailureCopy(gate, links)} live={false} testId="ai-email-gate" />;
  }
  if (options.length === 0) {
    return (
      <p className="text-sm text-fg-2" data-testid="ai-email-none">
        No alumni on this path can get a cold email from MakeItSo. Public figures, trustees and
        college officers are listed without one.
      </p>
    );
  }

  const generate = (alumnusId: string | null, regenerate: boolean) => {
    if (busy || !alumnusId) return;
    lastRequest.current = { alumnusId, regenerate };
    void run(async () => {
      const result = await callApi(aiApi.coldEmail, {
        body: { alumnusId, careerSlug, regenerate },
      });
      if (result.kind !== "ok") return result;
      const tagged: AiOk<EmailData> = { ...result, data: { ...result.data, alumnusId } };
      return tagged;
    });
  };

  const shown =
    state.phase === "ok" ? state.result : state.phase === "idle" ? null : state.previous;
  const email = shown ? filledEmail(shown.data.email, studentName) : null;
  const recipient = shown ? (options.find((a) => a.id === shown.data.alumnusId) ?? null) : null;
  const selectedAlumnus = options.find((a) => a.id === selected) ?? null;
  // The picker moved to someone else: offer a draft for them; the current draft stays until that one arrives.
  const switched = shown !== null && selected !== null && selected !== shown.data.alumnusId;

  return (
    <div ref={rootRef} tabIndex={-1} className={cn("flex flex-col gap-4", FOCUS_TARGET)}>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-fg">
          Who would you like to write to?
        </legend>
        <ul className="grid gap-2 md:grid-cols-2">
          {options.map((alumnus) => {
            const id = `${groupId}-${alumnus.id}`;
            return (
              <li key={alumnus.id} className="flex min-w-0">
                <label
                  htmlFor={id}
                  className="flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-lg border border-line-strong bg-bg p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-wash"
                >
                  <input
                    id={id}
                    type="radio"
                    name={`${groupId}-alumnus`}
                    value={alumnus.id}
                    checked={selected === alumnus.id}
                    onChange={() => setSelected(alumnus.id)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-fg">{alumnus.name}</span>
                    <AlumnusFacts alumnus={alumnus} />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <ProvenanceLine checkedAt={checkedAt} />
      </fieldset>

      {shown === null || switched ? (
        <div className="flex flex-col gap-2">
          <div>
            {/* aria-disabled, not disabled: a disabled button drops keyboard focus to <body>. */}
            <Button
              onClick={() => generate(selected, false)}
              aria-disabled={busy || !selected || undefined}
            >
              <Sparkles aria-hidden />
              {busy
                ? "Drafting…"
                : switched && selectedAlumnus
                  ? `Draft an email to ${selectedAlumnus.name}`
                  : "Draft an email"}
            </Button>
          </div>
          {switched && recipient ? (
            <p className="text-xs text-fg-3" data-testid="ai-email-kept">
              Your draft to {recipient.name} stays below until the new one is ready.
            </p>
          ) : null}
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {state.phase === "loading" ? "Drafting your email…" : ""}
        {state.phase === "ok" ? "Your email draft is ready." : ""}
      </p>

      {email ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="group"
          aria-label={recipient ? `Email draft to ${recipient.name}` : "Email draft"}
          aria-busy={busy || undefined}
          className={cn("flex flex-col gap-3", FOCUS_TARGET)}
          data-testid="ai-email-result"
        >
          {busy ? (
            <p className="text-sm font-semibold text-fg-2" data-testid="ai-email-stale">
              Drafting a new version… this one stays until it’s ready.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <AiChip label="review before sending" />
            {recipient ? <span className="text-xs text-fg-3">To {recipient.name}</span> : null}
          </div>
          <div className="rounded-lg border border-line bg-bg p-3.5 text-sm">
            <p className="font-semibold text-fg" data-testid="ai-email-subject">
              Subject: {email.subject}
            </p>
            <p className="mt-3 break-words whitespace-pre-wrap text-fg" data-testid="ai-email-body">
              {email.body}
            </p>
          </div>
          <p className="text-xs text-fg-3">
            Your name was filled in on this device. Check every detail, make it your own, and send
            it from your Davidson email or through LinkedIn.
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <CopyEmailButton text={email.clipboard} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generate(shown?.data.alumnusId ?? null, true)}
                aria-disabled={busy || undefined}
              >
                {busy ? "Drafting…" : "Draft another version"}
              </Button>
              <span className="text-xs text-fg-3">{REGENERATION_HINT}</span>
            </div>
          </div>
        </div>
      ) : null}

      {state.phase === "failed" ? (
        <div ref={failureRef} tabIndex={-1} className={FOCUS_TARGET}>
          <AiNotice
            copy={state.copy}
            busy={busy}
            onRetry={() => {
              const last = lastRequest.current;
              if (last) generate(last.alumnusId, last.regenerate);
            }}
            testId="ai-email-failure"
          />
        </div>
      ) : null}
    </div>
  );
}
