"use client";

import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/** Every syllabus the student has uploaded (PLAN-UX §3): its course, term, filename and when, with Review,
 * Replace and Delete per syllabus. */
export function SyllabusList({ syllabi, reviewingId, onReview, onReplace }: SyllabusListProps) {
  const action = useSyllabusAction();

  if (syllabi.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No syllabi uploaded yet"
        description={<p>Upload one above to pull its deadlines into your plan.</p>}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Your syllabus uploads">
      {syllabi.map((syllabus) => (
        <li
          key={syllabus.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3"
          data-testid="syllabus-row"
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-fg">{syllabus.courseCode}</span>
              <Badge variant="outline">{termLabel(syllabus.termCode)}</Badge>
            </p>
            <p className="mt-0.5 truncate text-sm text-fg-2">{syllabus.filename}</p>
            <p className="mt-0.5 text-xs text-fg-3">
              Uploaded {formatShortDate(syllabus.uploadedAt)} ·{" "}
              {syllabus.extractedDeadlines.length === 1
                ? "1 deadline found"
                : `${syllabus.extractedDeadlines.length} deadlines found`}
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
