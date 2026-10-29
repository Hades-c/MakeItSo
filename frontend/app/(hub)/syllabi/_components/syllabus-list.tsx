"use client";

import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { EmptyState } from "@/components/ui/empty-state";
import { notify } from "@/components/ui/notify";
import { callApi } from "@/lib/api/client";
import { syllabiEndpoints } from "@/lib/api/endpoints";
import { formatShortDate } from "@/lib/format";
import { termLabel } from "@/lib/term";
import type { Syllabus } from "@/lib/types/syllabus";
import { ConfirmButton } from "./confirm-button";
import { useSyllabusAction } from "./use-syllabus-action";

export interface SyllabusListProps {
  syllabi: readonly Syllabus[];
  reviewingId: string | null;
  onReview: (syllabus: Syllabus) => void;
  onReplace: (syllabus: Syllabus) => void;
}

/**
 * Every syllabus the student has added (PLAN-UX §3): its course, term, when, how many deadlines it gave and how
 * many of them are in the plan, with Review, Replace and Delete per syllabus. Delete says how many plan deadlines
 * go with it.
 */
function count(n: number): string {
  return n === 1 ? "1 deadline" : `${n} deadlines`;
}

export function SyllabusList({ syllabi, reviewingId, onReview, onReplace }: SyllabusListProps) {
  const action = useSyllabusAction();

  if (syllabi.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No syllabi yet"
        description={<p>Paste one above to find its deadlines and add them to your plan.</p>}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Your syllabi">
      {syllabi.map((syllabus) => (
        <li
          key={syllabus.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3"
          data-testid="syllabus-row"
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <CourseCode code={syllabus.courseCode} size="md" className="font-semibold" />
              <Badge variant="outline">{termLabel(syllabus.termCode)}</Badge>
            </p>
            <p className="mt-0.5 text-sm text-fg-2">
              Added {formatShortDate(syllabus.addedAt)} ·{" "}
              {count(syllabus.extractedDeadlines.length)} found · {syllabus.planDeadlineCount} in
              your plan
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-pressed={reviewingId === syllabus.id}
              onClick={() => onReview(syllabus)}
            >
              Review deadlines <span className="sr-only">for {syllabus.courseCode}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onReplace(syllabus)}>
              <RotateCcw aria-hidden />
              Replace <span className="sr-only">the syllabus for {syllabus.courseCode}</span>
            </Button>
            <ConfirmButton
              question={`Delete the syllabus for ${syllabus.courseCode}?`}
              details={
                syllabus.planDeadlineCount > 0
                  ? `This also removes the ${count(syllabus.planDeadlineCount)} it added to your plan.`
                  : "None of its deadlines are in your plan."
              }
              confirmLabel="Yes, delete"
              disabled={action.busy}
              onConfirm={() => {
                void action
                  .run(() => callApi(syllabiEndpoints.remove, { params: { id: syllabus.id } }), {
                    fallback: "Could not delete that. Please try again.",
                  })
                  .then((result) => {
                    if (result.ok)
                      notify.success(`Deleted the syllabus for ${syllabus.courseCode}.`);
                  });
              }}
            >
              <Trash2 aria-hidden />
              Delete <span className="sr-only">the syllabus for {syllabus.courseCode}</span>
            </ConfirmButton>
          </div>
        </li>
      ))}
    </ul>
  );
}
