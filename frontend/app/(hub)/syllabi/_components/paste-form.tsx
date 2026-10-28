"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, controlClass } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/api/client";
import { syllabiEndpoints } from "@/lib/api/endpoints";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/course-code";
import { routes } from "@/lib/routes";
import { MAX_SYLLABUS_CHARS, MIN_SYLLABUS_CHARS, usableChars } from "@/lib/syllabus-text";
import { termLabel } from "@/lib/term";
import { AI_FAILURE_MESSAGES } from "@/lib/types/ai-constants";
import type { Syllabus } from "@/lib/types/syllabus";
import { cn } from "@/lib/utils";
import { errorMessage } from "../_lib/errors";
import type { PasteGate } from "../_lib/load";

const LIMIT_TEXT = MAX_SYLLABUS_CHARS.toLocaleString("en-US");

type Draft = { courseCode: string; termCode: string; text: string };

/** What is wrong with the draft before sending, in one sentence; null when it can be sent. */
function draftProblem(draft: Draft): string | null {
  if (!COURSE_CODE_PATTERN.test(normalizeCourseCode(draft.courseCode))) {
    return "Enter a course code such as CSC 221.";
  }
  if (draft.text.length > MAX_SYLLABUS_CHARS) {
    return `That is ${draft.text.length.toLocaleString("en-US")} characters; paste at most ${LIMIT_TEXT}: the part of the syllabus with the schedule and due dates.`;
  }
  if (usableChars(draft.text) < MIN_SYLLABUS_CHARS) {
    return "Paste the syllabus text first: there is too little here to find dates in.";
  }
  return null;
}

export interface PasteFormProps {
  terms: readonly { code: string; label: string }[];
  defaultTerm: string;
  gate: PasteGate | null;
  unverifiedMessage?: string;
  /** /verify?reason=davidson&next=/syllabi for an unverified @davidson.edu account, else null. */
  verifyHref?: string | null;
  /** The student's syllabi, to warn before one is replaced. */
  syllabi?: readonly Syllabus[];
  /** Start from this course and term (the list's Replace). */
  replacing?: { courseCode: string; termCode: string } | null;
  onCancelReplace?: () => void;
  /** Whether "Find deadlines" is the page's one primary action (it is not while a review is open). */
  primary?: boolean;
  onAdded: (syllabus: Syllabus) => void;
}

/**
 * Paste a syllabus (PLAN-UX §3): course, term (the current one or the next) and the syllabus text, at most
 * MAX_SYLLABUS_CHARS characters, counted as the student types. The server sends the text to the AI extraction
 * (said in one line under the field, with the privacy page linked), keeps only the deadlines it finds, and
 * returns the stored syllabus, which the page then shows for review before anything is added to the plan. A
 * course and term that already have a syllabus are replaced: the form says so, and how many plan deadlines that
 * removes, before anything is sent.
 */
export function PasteForm({
  terms,
  defaultTerm,
  gate,
  unverifiedMessage,
  verifyHref = null,
  syllabi = [],
  replacing = null,
  onCancelReplace,
  primary = true,
  onAdded,
}: PasteFormProps) {
  const id = React.useId();
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>({
    courseCode: replacing?.courseCode ?? "",
    termCode: replacing?.termCode ?? defaultTerm,
    text: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (replacing) textRef.current?.focus();
  }, [replacing]);

  if (gate && gate !== "ready") {
    const message =
      gate === "unverified"
        ? unverifiedMessage || AI_FAILURE_MESSAGES[gate]
        : AI_FAILURE_MESSAGES[gate];
    return (
      <Notice tone="info" data-testid="syllabi-gate" data-gate={gate}>
        <p>{message}</p>
        {gate === "consent_required" ? (
          <p className="mt-1">
            <Link
              href={routes.profile()}
              className="inline-flex min-h-11 items-center font-semibold link md:min-h-0"
            >
              Turn on AI features in your profile
            </Link>
          </p>
        ) : gate === "unverified" && verifyHref ? (
          <p className="mt-1">
            <Link
              href={verifyHref}
              className="inline-flex min-h-11 items-center font-semibold link md:min-h-0"
            >
              Verify your Davidson email
            </Link>
          </p>
        ) : null}
      </Notice>
    );
  }

  const code = normalizeCourseCode(draft.courseCode);
  const existing = syllabi.find((s) => s.courseCode === code && s.termCode === draft.termCode);
  const over = draft.text.length > MAX_SYLLABUS_CHARS;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const issue = draftProblem(draft);
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const result = await callApi(syllabiEndpoints.paste, {
        body: { courseCode: code, termCode: draft.termCode, text: draft.text },
      });
      if (result.kind === "ok") {
        onAdded(result.data.syllabus);
        setDraft({
          courseCode: replacing ? draft.courseCode : "",
          termCode: draft.termCode,
          text: "",
        });
        // The list below ("Your syllabi") is the server's: show the new or replaced syllabus there too.
        router.refresh();
      } else {
        setProblem(result.message);
      }
    } catch (error) {
      setProblem(errorMessage(error, "Could not read that syllabus. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-course`} label="Course">
          <Input
            value={draft.courseCode}
            placeholder="e.g. CSC 221"
            autoComplete="off"
            disabled={busy || !!replacing}
            onChange={(event) => setDraft((d) => ({ ...d, courseCode: event.target.value }))}
          />
        </Field>
        <Field id={`${id}-term`} label="Term">
          <select
            id={`${id}-term`}
            className={cn(controlClass, "h-11 px-3 md:h-10")}
            value={draft.termCode}
            disabled={busy || !!replacing}
            onChange={(event) => setDraft((d) => ({ ...d, termCode: event.target.value }))}
          >
            {terms.map((term) => (
              <option key={term.code} value={term.code}>
                {term.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        id={`${id}-text`}
        label="Syllabus text"
        hint={
          <>
            Copy the schedule and due dates from your syllabus and paste them here.{" "}
            <span className={cn("tabular-nums", over && "font-semibold text-fg")}>
              {draft.text.length.toLocaleString("en-US")} of {LIMIT_TEXT} characters
            </span>
            {over ? " (too long)" : null}
          </>
        }
      >
        <Textarea
          ref={textRef}
          rows={8}
          value={draft.text}
          spellCheck={false}
          disabled={busy}
          onChange={(event) => setDraft((d) => ({ ...d, text: event.target.value }))}
        />
      </Field>
      <p className="text-xs text-fg-2" data-testid="syllabus-disclosure">
        MakeItSo sends this text to Anthropic&apos;s Claude to find the deadlines, then discards it:
        only the deadlines are kept, and you review them before any reach your plan.{" "}
        <Link href={`${routes.privacy()}#ai`} className="link">
          Privacy
        </Link>
      </p>
      {existing ? (
        <Notice tone="warning" data-testid="syllabus-replace-warning">
          You already added a syllabus for {existing.courseCode}, {termLabel(existing.termCode)}.
          This one replaces it
          {existing.planDeadlineCount > 0
            ? ` and removes the ${existing.planDeadlineCount === 1 ? "deadline" : `${existing.planDeadlineCount} deadlines`} it added to your plan.`
            : "."}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant={primary ? "primary" : "secondary"} disabled={busy}>
          <ScanText aria-hidden />
          {busy
            ? "Reading your syllabus…"
            : existing
              ? "Replace and find deadlines"
              : "Find deadlines"}
        </Button>
        {replacing && onCancelReplace ? (
          <Button type="button" variant="ghost" onClick={onCancelReplace} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
      <Notice tone="error" role="alert">
        {problem}
      </Notice>
    </form>
  );
}
