"use client";

import * as React from "react";
import type { ExtractedDeadline, Syllabus } from "@/lib/types/syllabus";
import type { UploadGate } from "../_lib/load";
import { ReviewDeadlines } from "./review-deadlines";
import { SyllabusList } from "./syllabus-list";
import { UploadForm } from "./upload-form";

interface Reviewing {
  syllabusId: string;
  courseCode: string;
  deadlines: readonly ExtractedDeadline[];
}

export interface SyllabiBoardProps {
  syllabi: readonly Syllabus[];
  terms: readonly { code: string; label: string }[];
  defaultTerm: string;
  gate: UploadGate | null;
  unverifiedMessage?: string;
  verifyHref?: string | null;
}

/**
 * The whole /syllabi page below its header: upload, the review-before-save step, and the list of earlier
 * uploads. `syllabi` is the server's own list (app/(hub)/syllabi/page.tsx); every mutation refreshes it through
 * useSyllabusAction's router.refresh(), the same way app/(hub)/plan's editors do, so this component holds no copy
 * of its own.
 */
export function SyllabiBoard({
  syllabi,
  terms,
  defaultTerm,
  gate,
  unverifiedMessage,
  verifyHref,
}: SyllabiBoardProps) {
  const [reviewing, setReviewing] = React.useState<Reviewing | null>(null);
  const [replacing, setReplacing] = React.useState<Syllabus | null>(null);

  const review = (syllabus: Syllabus) => {
    setReviewing({
      syllabusId: syllabus.id,
      courseCode: syllabus.courseCode,
      deadlines: syllabus.extractedDeadlines,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-labelledby="syllabus-upload-title"
        className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5"
      >
        <h2
          id="syllabus-upload-title"
          tabIndex={-1}
          className="mb-3 font-display text-lg font-strong tracking-title text-fg"
        >
          Upload a syllabus
        </h2>
        <UploadForm
          key={replacing ? `${replacing.courseCode}-${replacing.termCode}` : "new"}
          terms={terms}
          defaultTerm={defaultTerm}
          gate={gate}
          unverifiedMessage={unverifiedMessage}
          verifyHref={verifyHref}
          replacing={
            replacing ? { courseCode: replacing.courseCode, termCode: replacing.termCode } : null
          }
          onCancelReplace={() => setReplacing(null)}
          onUploaded={(syllabus) => {
            setReplacing(null);
            review(syllabus);
          }}
        />
      </section>

      {reviewing ? (
        <section
          aria-labelledby="syllabus-review-title"
          className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5"
        >
          <h2
            id="syllabus-review-title"
            className="mb-3 font-display text-lg font-strong tracking-title text-fg"
          >
            Review deadlines for {reviewing.courseCode}
          </h2>
          <ReviewDeadlines
            syllabusId={reviewing.syllabusId}
            courseCode={reviewing.courseCode}
            deadlines={reviewing.deadlines}
            onDone={() => setReviewing(null)}
          />
        </section>
      ) : null}

      <section aria-labelledby="syllabus-list-title">
        <h2
          id="syllabus-list-title"
          className="mb-3 font-display text-lg font-strong tracking-title text-fg"
        >
          Your uploads
        </h2>
        <SyllabusList
          syllabi={syllabi}
          reviewingId={reviewing?.syllabusId ?? null}
          onReview={review}
          onReplace={(syllabus) => {
            setReviewing(null);
            setReplacing(syllabus);
            document.getElementById("syllabus-upload-title")?.focus();
          }}
        />
      </section>
    </div>
  );
}
