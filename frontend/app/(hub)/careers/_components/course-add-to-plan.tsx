"use client";

import * as React from "react";
import Link from "next/link";
import { AddToPlanControl, type AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import { ApiClientError, callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import { cn } from "@/lib/utils";

/**
 * Add a career's course to the plan (client island over AddToPlanControl). The term choice shows the live
 * availability the server resolved; the button calls POST /api/plan/items through callApi (lib/api/plan.ts).
 *
 * The plan service lands separately (W5s). Until it does, the route is missing (404) or answers 501/503: that is
 * said in words ("isn't available yet"), nothing is pretended. A 409 means the course is already in the plan for
 * that term. Warnings the service returns (a retake, a restriction) are shown, never a reason to block.
 */

export const PLAN_UNAVAILABLE_MESSAGE =
  "Adding courses to your plan isn’t available yet. Try again later.";
export const SIGNED_OUT_MESSAGE = "Your session has ended. Sign in again to add courses.";

type Notice =
  | { tone: "success"; text: string; warnings: string[] }
  | { tone: "info"; text: string }
  | { tone: "error"; text: string; signIn?: boolean };

export interface CourseAddToPlanProps {
  courseCode: string;
  terms: readonly AddToPlanTerm[];
  /** The term to start on (the registration term when it can be chosen). */
  initialTerm: string | null;
  /** Terms the course is already in the plan for (from the server; empty when the plan cannot be read). */
  inPlanTerms: readonly string[];
  /** The current term: an add there is "in-progress", elsewhere "planned". */
  currentTerm: string;
  /** Where "Open My plan" goes. */
  planHref: string;
  /** Where "Sign in" goes when the session has ended. */
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
    if (
      error.status === 404 ||
      error.status === 501 ||
      error.status === 503 ||
      error.code === "unavailable"
    ) {
      return { tone: "info", text: PLAN_UNAVAILABLE_MESSAGE };
    }
    if (error.code === "network") return { tone: "error", text: error.message };
    if (error.code === "validation_failed" || error.code === "bad_request") {
      return { tone: "error", text: error.message };
    }
  }
  return { tone: "error", text: `Could not add ${courseCode} to ${termLabel}. Please try again.` };
}

export function CourseAddToPlan({
  courseCode,
  terms,
  initialTerm,
  inPlanTerms,
  currentTerm,
  planHref,
  loginHref,
  className,
}: CourseAddToPlanProps) {
  const [value, setValue] = React.useState<string | null>(initialTerm);
  const [pending, setPending] = React.useState(false);
  const [inPlan, setInPlan] = React.useState<ReadonlySet<string>>(() => new Set(inPlanTerms));
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const onAdd = async (termCode: string) => {
    setPending(true);
    setNotice(null);
    const label = labelOf(terms, termCode);
    try {
      const result = await callApi(planApi.addItem, {
        body: {
          termCode,
          courseCode,
          status: termCode === currentTerm ? "in-progress" : "planned",
          source: "catalog",
        },
      });
      setInPlan((previous) => new Set(previous).add(termCode));
      setNotice({
        tone: "success",
        text: `Added ${courseCode} to ${label}.`,
        warnings: result.warnings.map((warning) => warning.message),
      });
    } catch (error) {
      const next = noticeForError(error, label, courseCode);
      if (error instanceof ApiClientError && (error.status === 409 || error.code === "conflict")) {
        setInPlan((previous) => new Set(previous).add(termCode));
      }
      setNotice(next);
    } finally {
      setPending(false);
    }
  };

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
        added={value !== null && inPlan.has(value)}
        courseCode={courseCode}
      />
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
              <ul className="mt-1 list-disc pl-5 text-fg">
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
