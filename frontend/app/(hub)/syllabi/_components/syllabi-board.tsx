"use client";

import * as React from "react";
import type { MoodleStatus } from "@/lib/types/moodle";
import type { ExtractedDeadline, Syllabus } from "@/lib/types/syllabus";
import type { PasteGate } from "../_lib/load";
import { MoodlePanel } from "./moodle-panel";
import { PasteForm } from "./paste-form";
import { ReviewDeadlines, type ReviewTerm } from "./review-deadlines";
import { SyllabusList } from "./syllabus-list";

interface Reviewing {
  syllabusId: string;
  courseCode: string;
  termCode: string;
  deadlines: readonly ExtractedDeadline[];
}

export interface SyllabiBoardProps {
  syllabi: readonly Syllabus[];
  /** The terms a syllabus can be for (current, next), with their first and last day when known. */
  terms: readonly ({ code: string; label: string } & Omit<ReviewTerm, "label">)[];
  defaultTerm: string;
  gate: PasteGate | null;
  unverifiedMessage?: string;
  verifyHref?: string | null;
  /** The Moodle panel (/syllabi only): left out, the board is the syllabus part alone. */
  moodle?: { enabled: boolean; status: MoodleStatus; now: string } | null;
}

const CARD = "rounded-xl border border-line bg-surface p-4 shadow-card md:px-5";
const TITLE = "mb-3 font-display text-lg font-strong tracking-title text-fg";

/**
 * The whole /syllabi page below its header: Connect Moodle, paste a syllabus, the review-before-save step, and
 * the list of earlier syllabi. `syllabi` and the Moodle status are the server's (app/(hub)/syllabi/page.tsx);
 * every mutation refreshes them through router.refresh(), the same way app/(hub)/plan's editors do.
 *
 * One primary action at a time: the review's "Add to plan" while a review is open, else Connect Moodle while it
 * is not connected, else "Find deadlines".
 */
export function SyllabiBoard({
  syllabi,
  terms,
  defaultTerm,
  gate,
  unverifiedMessage,
  verifyHref,
  moodle = null,
}: SyllabiBoardProps) {
  const [reviewing, setReviewing] = React.useState<Reviewing | null>(null);
  const [replacing, setReplacing] = React.useState<Syllabus | null>(null);

  const review = (syllabus: Syllabus) => {
    setReviewing({
      syllabusId: syllabus.id,
      courseCode: syllabus.courseCode,
      termCode: syllabus.termCode,
      deadlines: syllabus.extractedDeadlines,
    });
  };
  const moodleShown =
    !!moodle && (moodle.enabled || moodle.status.connected || moodle.status.deadlines.length > 0);
  const connectIsPrimary = !reviewing && !!moodle?.enabled && !moodle.status.connected;
  const reviewTerm = reviewing ? terms.find((term) => term.code === reviewing.termCode) : undefined;

  return (
    <div className="flex flex-col gap-5">
      {moodle && moodleShown ? (
        <section aria-labelledby="moodle-title" className={CARD}>
          <h2 id="moodle-title" className={TITLE}>
            {moodle.status.connected ? "Moodle" : "Connect Moodle"}
          </h2>
          <MoodlePanel
            enabled={moodle.enabled}
            status={moodle.status}
            now={moodle.now}
            primary={connectIsPrimary}
          />
        </section>
      ) : null}

      <section aria-labelledby="syllabus-paste-title" className={CARD}>
        <h2 id="syllabus-paste-title" className={TITLE}>
          {replacing ? `Replace the syllabus for ${replacing.courseCode}` : "Paste a syllabus"}
        </h2>
        <PasteForm
          key={replacing ? `${replacing.courseCode}-${replacing.termCode}` : "new"}
          terms={terms}
          defaultTerm={defaultTerm}
          gate={gate}
          unverifiedMessage={unverifiedMessage}
          verifyHref={verifyHref}
          syllabi={syllabi}
          primary={!reviewing && !connectIsPrimary}
          replacing={
            replacing ? { courseCode: replacing.courseCode, termCode: replacing.termCode } : null
          }
          onCancelReplace={() => setReplacing(null)}
          onAdded={(syllabus) => {
            setReplacing(null);
            review(syllabus);
          }}
        />
      </section>

      {reviewing ? (
        <section aria-labelledby="syllabus-review-title" className={CARD}>
          <h2 id="syllabus-review-title" className={TITLE}>
            Review deadlines for {reviewing.courseCode}
          </h2>
          <ReviewDeadlines
            key={reviewing.syllabusId}
            syllabusId={reviewing.syllabusId}
            courseCode={reviewing.courseCode}
            deadlines={reviewing.deadlines}
            term={reviewTerm ?? null}
            onDone={() => setReviewing(null)}
          />
        </section>
      ) : null}

      <section aria-labelledby="syllabus-list-title">
        <h2 id="syllabus-list-title" className={TITLE}>
          Your syllabi
        </h2>
        <SyllabusList
          syllabi={syllabi}
          reviewingId={reviewing?.syllabusId ?? null}
          onReview={review}
          onReplace={(syllabus) => {
            // The paste form remounts for that course and term and focuses its text field.
            setReviewing(null);
            setReplacing(syllabus);
          }}
        />
      </section>
    </div>
  );
}
