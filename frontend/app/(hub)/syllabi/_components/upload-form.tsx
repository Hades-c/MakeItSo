"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, controlClass } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import {
  ACCEPTED_FILE_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/syllabus-upload";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/course-code";
import { termLabel } from "@/lib/term";
import type { Syllabus } from "@/lib/types/syllabus";
import { AI_FAILURE_MESSAGES } from "@/lib/types/ai-constants";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import Link from "next/link";
import { uploadSyllabusFile } from "../_lib/upload";
import type { UploadGate } from "../_lib/load";

const MAX_MB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

type Draft = { courseCode: string; termCode: string };

function fileProblem(file: File | null): string | null {
  if (!file) return "Choose a file.";
  if (file.size > MAX_UPLOAD_BYTES) return `That file is larger than ${MAX_MB} MB.`;
  if (ACCEPTED_MIME_TYPES.includes(file.type)) return null;
  if (/\.(pdf|docx)$/i.test(file.name)) return null;
  return "Upload a PDF or a Word (.docx) file.";
}

export interface UploadFormProps {
  terms: readonly { code: string; label: string }[];
  defaultTerm: string;
  gate: UploadGate | null;
  unverifiedMessage?: string;
  /** /verify?reason=davidson&next=/syllabi for an unverified @davidson.edu account, else null. */
  verifyHref?: string | null;
  replacing?: { courseCode: string; termCode: string } | null;
  onCancelReplace?: () => void;
  onUploaded: (syllabus: Syllabus) => void;
}

/**
 * Upload a syllabus: course, term and a PDF or Word file (PLAN-UX §3). The file is sent as multipart form data
 * (uploadSyllabusFile, not callApi: callApi only sends JSON); the server extracts the text, runs the AI
 * extraction and returns the stored syllabus with its deadlines, which the page then shows for review before
 * anything is added to the plan. Uploading again for the same course and term replaces the earlier upload
 * (`replacing` shows that as a heads-up, from SyllabusList's Replace button).
 */
export function UploadForm({
  terms,
  defaultTerm,
  gate,
  unverifiedMessage,
  verifyHref = null,
  replacing = null,
  onCancelReplace,
  onUploaded,
}: UploadFormProps) {
  const id = React.useId();
  const [draft, setDraft] = React.useState<Draft>({
    courseCode: replacing?.courseCode ?? "",
    termCode: replacing?.termCode ?? defaultTerm,
  });
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  if (gate && gate !== "ready") {
    const message =
      gate === "unverified"
        ? unverifiedMessage || AI_FAILURE_MESSAGES[gate]
        : AI_FAILURE_MESSAGES[gate];
    return (
      <Notice tone="info" data-testid="syllabi-gate" data-gate={gate}>
        <p>{message}</p>
        {gate === "consent_required" ? (
          <p className="mt-2">
            <Link href={routes.profile()} className="font-semibold link">
              Turn on AI features in your profile
            </Link>
          </p>
        ) : gate === "unverified" && verifyHref ? (
          <p className="mt-2">
            <Link href={verifyHref} className="font-semibold link">
              Verify your Davidson email
            </Link>
          </p>
        ) : null}
      </Notice>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedCode = normalizeCourseCode(draft.courseCode);
    if (!COURSE_CODE_PATTERN.test(normalizedCode)) {
      setProblem("Enter a course code such as CSC 221.");
      return;
    }
    const fileIssue = fileProblem(file);
    if (fileIssue) {
      setProblem(fileIssue);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const result = await uploadSyllabusFile({
        file: file!,
        courseCode: normalizedCode,
        termCode: draft.termCode,
      });
      if (result.kind === "ok") {
        onUploaded(result.data.syllabus);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        if (!replacing) setDraft({ courseCode: "", termCode: draft.termCode });
      } else {
        setProblem(result.message);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not upload that file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
      {replacing ? (
        <p className="text-sm text-fg-2">
          Replacing the syllabus for <b className="font-semibold text-fg">{replacing.courseCode}</b>
          , {termLabel(replacing.termCode)}. Its earlier extracted deadlines will be removed from
          your plan; review the new ones below once this finishes.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-course`} label="Course">
          <Input
            value={draft.courseCode}
            placeholder="e.g. CSC 221"
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
      <Field id={`${id}-file`} label={`PDF or Word file, up to ${MAX_MB} MB`}>
        <Input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_FILE_EXTENSIONS}
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          <Upload aria-hidden />
          {busy ? "Reading your syllabus…" : replacing ? "Upload replacement" : "Upload syllabus"}
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
