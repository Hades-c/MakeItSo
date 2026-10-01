"use client";

import * as React from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { AiChip } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { aiApi } from "@/lib/api/ai";
import { callApi } from "@/lib/api/client";
import type { AiFailure, ColdEmail } from "@/lib/types/ai";
import { useAiRequest } from "./ai-request";
import { aiFailureCopy, AiNotice, type AiStepLinks } from "./ai-result";

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
}

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

function describe(alumnus: ColdEmailAlumnus): string {
  const work = [alumnus.role, alumnus.organization].filter(Boolean).join(", ");
  const year = alumnus.classYear ? `Class of ${alumnus.classYear}` : null;
  return [work, year].filter(Boolean).join(" · ");
}

function CopyEmailButton({ text }: { text: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  React.useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
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
    <div className="flex flex-col gap-1">
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
            ? "Your browser didn’t allow copying. Select the text and copy it yourself."
            : ""}
      </p>
    </div>
  );
}

export function AiColdEmailPanel({
  careerSlug,
  alumni,
  studentName,
  gate,
  links,
}: AiColdEmailPanelProps) {
  const options = React.useMemo(() => contactableOnly(alumni), [alumni]);
  const [selected, setSelected] = React.useState<string | null>(options[0]?.id ?? null);
  const [requestedFor, setRequestedFor] = React.useState<string | null>(null);
  const { state, run, busy, reset } = useAiRequest<{ email: ColdEmail }>(links);
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

  const generate = (regenerate: boolean) => {
    if (!selected) return;
    setRequestedFor(selected);
    void run(() =>
      callApi(aiApi.coldEmail, { body: { alumnusId: selected, careerSlug, regenerate } }),
    );
  };

  const choose = (id: string) => {
    if (id === selected) return;
    setSelected(id);
    reset();
  };

  const recipient = options.find((a) => a.id === requestedFor) ?? null;
  const shown =
    state.phase === "ok" ? state.result : state.phase === "idle" ? null : state.previous;
  const email = shown ? filledEmail(shown.data.email, studentName) : null;

  return (
    <div className="flex flex-col gap-4">
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
                    onChange={() => choose(alumnus.id)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-fg">{alumnus.name}</span>
                    {describe(alumnus) ? (
                      <span className="text-xs text-fg-2">{describe(alumnus)}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {shown === null ? (
        <div>
          <Button onClick={() => generate(false)} disabled={busy || !selected}>
            <Sparkles aria-hidden />
            {busy ? "Drafting…" : "Draft an email"}
          </Button>
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {state.phase === "loading" ? "Drafting your email…" : ""}
        {state.phase === "ok" ? "Your email draft is ready." : ""}
      </p>

      {email ? (
        <div className="flex flex-col gap-3" data-testid="ai-email-result">
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
            <Button variant="ghost" size="sm" onClick={() => generate(true)} disabled={busy}>
              {busy ? "Drafting…" : "Draft another version"}
            </Button>
          </div>
        </div>
      ) : null}

      {state.phase === "failed" ? (
        <AiNotice
          copy={state.copy}
          busy={busy}
          onRetry={() => generate(state.previous !== null)}
          testId="ai-email-failure"
        />
      ) : null}
    </div>
  );
}
