"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, TriangleAlert } from "lucide-react";
import { AddToPlanControl, type AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { ApiClientError, callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import { cn } from "@/lib/utils";

/**
 * "Add to <term>" for one course (client island over AddToPlanControl; POST /api/plan/items through callApi with
 * the lib/api/plan.ts spec). The term choice shows the availability the server resolved; warnings the server
 * already knows for a term (a retake, a restriction, a time conflict with the plan) are shown with the choice,
 * before the add, and the plan service's own warnings after it. Nothing here ever blocks an add (PLAN §5).
 *
 * After an add the page refreshes (router.refresh) so the week grid and the other rows' warnings see it.
 *
 * The current term is allowed (a class the student is taking now): the add records it as in-progress and the
 * control says so first. A 409 means the course is already in the plan for that term.
 */

export const PLAN_UNAVAILABLE_MESSAGE =
  "Adding courses to your plan isn’t available right now. Try again later.";
export const SIGNED_OUT_MESSAGE = "Your session has ended. Sign in again to add courses.";

type Notice =
  | { tone: "success"; text: string; warnings: string[] }
  | { tone: "info"; text: string }
  | { tone: "error"; text: string; signIn?: boolean };

export interface AddCourseProps {
  courseCode: string;
  terms: readonly AddToPlanTerm[];
  initialTerm: string | null;
  /** Terms the course is already in the plan for. */
  inPlanTerms: readonly string[];
  /** The current term: an add there is "in-progress", elsewhere "planned". */
  currentTerm: string;
  /** Warnings known before the add, per term code. */
  warnings?: Readonly<Record<string, readonly string[]>>;
  /** The section to record per term (the course page's chosen section), e.g. { "202602": "20135" }. */
  crns?: Readonly<Record<string, string>>;
  /** Section label per term for the button's explanation ("CSC 221 A"). */
  sectionLabels?: Readonly<Record<string, string>>;
  /** "Fall 2027 isn’t published yet. Usually offered in Fall (based on …)." */
  unpublishedNote?: string | null;
  planHref: string;
  loginHref: string;
  className?: string;
}

function labelOf(terms: readonly AddToPlanTerm[], code: string): string {
  return terms.find((term) => term.code === code)?.label ?? code;
}

/** What a failed add means for the student (exported for tests). */
export function noticeForError(error: unknown, termLabel: string, courseCode: string): Notice {
  if (error instanceof ApiClientError) {
    if (error.status === 409 || error.code === "conflict") {
      return { tone: "info", text: `${courseCode} is already in your plan for ${termLabel}.` };
    }
    if (error.status === 401 || error.code === "unauthorized") {
      return { tone: "error", text: SIGNED_OUT_MESSAGE, signIn: true };
    }
    if (error.status === 501 || error.status === 503 || error.code === "unavailable") {
      return { tone: "info", text: PLAN_UNAVAILABLE_MESSAGE };
    }
    if (
      error.code === "network" ||
      error.code === "validation_failed" ||
      error.code === "bad_request"
    ) {
      return { tone: "error", text: error.message };
    }
  }
  return { tone: "error", text: `Could not add ${courseCode} to ${termLabel}. Please try again.` };
}

export function AddCourse({
  courseCode,
  terms,
  initialTerm,
  inPlanTerms,
  currentTerm,
  warnings = {},
  crns = {},
  sectionLabels = {},
  unpublishedNote = null,
  planHref,
  loginHref,
  className,
}: AddCourseProps) {
  const [value, setValue] = React.useState<string | null>(initialTerm);
  const [pending, setPending] = React.useState(false);
  const [inPlan, setInPlan] = React.useState<ReadonlySet<string>>(() => new Set(inPlanTerms));
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const router = useRouter();

  const onAdd = async (termCode: string) => {
    setPending(true);
    setNotice(null);
    const label = labelOf(terms, termCode);
    const crn = crns[termCode];
    try {
      const result = await callApi(planApi.addItem, {
        body: {
          termCode,
          courseCode,
          ...(crn ? { crn } : {}),
          status: termCode === currentTerm ? "in-progress" : "planned",
          source: "catalog",
        },
      });
      setInPlan((previous) => new Set(previous).add(termCode));
      setNotice({
        tone: "success",
        text: `Added ${sectionLabels[termCode] ?? courseCode} to ${label}.`,
        warnings: [...new Set(result.warnings.map((warning) => warning.message))],
      });
      // The server parts (week grid, conflict warnings, sidebar credits) re-render with the new plan.
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 409 || error.code === "conflict")) {
        setInPlan((previous) => new Set(previous).add(termCode));
      }
      setNotice(noticeForError(error, label, courseCode));
    } finally {
      setPending(false);
    }
  };

  const added = value !== null && inPlan.has(value);
  const chosen = terms.find((term) => term.code === value);
  const selectable = chosen !== undefined && chosen.availability !== "not-offered";
  const underway = value === currentTerm && !added && selectable;
  const before = selectable && value && !added ? (warnings[value] ?? []) : [];
  const showUnpublished = Boolean(unpublishedNote && chosen?.availability === "not-yet-published");
  const section = value && selectable ? sectionLabels[value] : undefined;

  const notes =
    showUnpublished || underway || before.length > 0 || section ? (
      <div className="flex flex-col gap-1.5 text-sm">
        {section && !added ? (
          <p className="text-fg-2" data-testid="add-section">
            Adds section <span className="font-mono text-xs font-semibold">{section}</span>.
          </p>
        ) : null}
        {showUnpublished ? (
          <p className="text-fg-2" data-testid="usually-offered">
            {unpublishedNote}
          </p>
        ) : null}
        {underway ? (
          <p className="flex items-start gap-1.5 text-fg" data-testid="current-term-note">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              {labelOf(terms, currentTerm)} is under way: adding {courseCode} there records it as a
              class you’re taking this term.
            </span>
          </p>
        ) : null}
        {before.length > 0 ? (
          <ul className="flex flex-col gap-1" data-testid="add-warnings">
            {before.map((warning) => (
              <li key={warning} className="flex items-start gap-1.5 text-fg">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  <span className="sr-only">Warning: </span>
                  {warning}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : null;

  return (
    <div className={className}>
      <AddToPlanControl
        terms={terms}
        value={value}
        onChange={(code) => {
          setValue(code);
          setNotice(null);
        }}
        onAdd={(code) => void onAdd(code)}
        pending={pending}
        added={added}
        courseCode={courseCode}
      >
        {notes}
      </AddToPlanControl>
      <div aria-live="polite" data-testid="add-to-plan-notice">
        {notice ? (
          <div
            className={cn(
              "mt-2 rounded-md px-3 py-2 text-sm",
              notice.tone === "success" && "bg-success-wash text-success",
              notice.tone === "info" && "bg-surface-2 text-fg-2",
              notice.tone === "error" && "bg-danger-wash text-danger",
            )}
          >
            <p>
              {notice.text}{" "}
              {notice.tone === "success" ? (
                <Link href={planHref} className="font-semibold underline underline-offset-2">
                  Open My plan
                </Link>
              ) : null}
              {notice.tone === "error" && notice.signIn ? (
                <Link href={loginHref} className="font-semibold underline underline-offset-2">
                  Sign in
                </Link>
              ) : null}
            </p>
            {notice.tone === "success" && notice.warnings.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-fg" data-testid="added-warnings">
                {notice.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
