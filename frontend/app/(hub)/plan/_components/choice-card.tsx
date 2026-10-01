"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2, TriangleAlert } from "lucide-react";
import { SeatBar } from "@/components/domain/seat-bar";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import type { PlanWarning, RequirementSlot } from "@/lib/types/plan";
import { cn } from "@/lib/utils";
import { SEAT_PRESSURE_TEXT, seatPressure, slotNote, type SlotFiller } from "../_lib/choice";
import { meetingsText, type SectionTimes } from "../_lib/week";
import { ConfirmButton } from "./confirm-button";

/**
 * One ranked WebTree choice with its alternates: the section, its meetings and seats (seat pressure), the
 * requirement slots it could fill, its restriction flags (never a block), and keyboard-reachable controls to
 * reorder, remove and manage alternates. Every control names the course it acts on.
 */

/** The report's per-section detail (server/plan WebTreeSectionDetail), as plain data. */
export interface SectionDetail {
  crn: string;
  found: boolean;
  courseCode: string;
  section: string | null;
  title: string | null;
  credits: number | null;
  seats: {
    current: number;
    max: number;
    remaining: number;
    open: number;
    overEnrolled: boolean;
    pressure: number | null;
  } | null;
  registerAs: { crn: string; courseCode: string; section: string } | null;
  slots: {
    slot: RequirementSlot;
    code: string;
    status: "done" | "this-term" | "planned" | "open";
  }[];
  flags: PlanWarning[];
}

export interface ChoiceView {
  rank: number;
  crn: string;
  courseCode: string;
  alternates: string[];
}

export interface ChoiceCardProps {
  termCode: string;
  choice: ChoiceView;
  /** Report detail per CRN (missing while a just-added section is being checked). */
  details: Readonly<Record<string, SectionDetail>>;
  sections: Readonly<Record<string, SectionTimes & { instructors?: string[] }>>;
  slotLabels: Readonly<Record<RequirementSlot, string>>;
  slotFillers: Readonly<Partial<Record<RequirementSlot, SlotFiller>>>;
  conflicting: ReadonlySet<string>;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onAddAlternate: () => void;
  onPromote: (crn: string) => void;
  onRemoveAlternate: (crn: string) => void;
}

function codeOf(
  crn: string,
  fallbackCode: string,
  detail: SectionDetail | undefined,
  section: SectionTimes | undefined,
) {
  const courseCode = detail?.courseCode ?? section?.courseCode ?? fallbackCode;
  const letter = detail?.section ?? section?.section ?? null;
  return {
    courseCode,
    letter,
    label: letter ? `${courseCode} ${letter}` : `${courseCode} (CRN ${crn})`,
  };
}

function SectionFacts({
  crn,
  termCode,
  courseCode,
  detail,
  section,
  slotLabels,
  slotFillers,
  conflict,
  compact,
}: {
  crn: string;
  termCode: string;
  courseCode: string;
  detail: SectionDetail | undefined;
  section: (SectionTimes & { instructors?: string[] }) | undefined;
  slotLabels: Readonly<Record<RequirementSlot, string>>;
  slotFillers: Readonly<Partial<Record<RequirementSlot, SlotFiller>>>;
  conflict: boolean;
  compact?: boolean;
}) {
  if (detail && !detail.found) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-danger">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        CRN {crn} is no longer in the schedule. Remove it or pick another section.
      </p>
    );
  }
  const pressure = seatPressure(detail?.seats ?? null);
  const pressureText = SEAT_PRESSURE_TEXT[pressure];
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {section ? (
        <ul className="text-fg-2">
          {meetingsText(section.meetings).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
          {!compact && section.instructors && section.instructors.length > 0 ? (
            <li className="text-xs text-fg-3">{section.instructors.join(", ")}</li>
          ) : null}
        </ul>
      ) : null}
      {conflict ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          Time conflict (see the conflict check)
        </p>
      ) : null}
      {detail?.registerAs ? (
        <p className="text-fg">
          Register as {detail.registerAs.courseCode} {detail.registerAs.section} (CRN{" "}
          {detail.registerAs.crn}): this listing has no seats of its own.
        </p>
      ) : null}
      {detail?.seats ? (
        <div className="max-w-xs">
          <SeatBar
            size="sm"
            current={detail.seats.current}
            max={detail.seats.max}
            remaining={detail.seats.remaining}
            courseCode={courseCode}
          />
          {pressureText ? (
            <p className="mt-1 text-xs font-semibold text-fg">{pressureText}</p>
          ) : null}
        </div>
      ) : null}
      {!compact && detail && detail.slots.length > 0 ? (
        <ul className="flex flex-col gap-0.5" aria-label="Requirements">
          {detail.slots.map((entry) => {
            const note = slotNote(
              entry.slot,
              entry.status,
              slotLabels[entry.slot],
              slotFillers[entry.slot],
              {
                courseCode,
                termCode,
              },
            );
            return (
              <li key={entry.slot} className="flex items-start gap-1.5 text-xs">
                <ListChecks aria-hidden className="mt-px size-3.5 shrink-0 text-fg-3" />
                <span className={cn(note.tone === "open" ? "font-semibold text-fg" : "text-fg-2")}>
                  {note.text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!compact && detail && detail.found && detail.slots.length === 0 ? (
        <p className="text-xs text-fg-3">Fills no requirement slot (or the schedule lists none).</p>
      ) : null}
      {detail && detail.flags.length > 0 ? (
        <ul className="flex flex-col gap-0.5" aria-label="Restrictions">
          {detail.flags.map((flag) => (
            <li
              key={`${flag.code}-${flag.message}`}
              className="flex items-start gap-1.5 text-xs text-fg"
            >
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-warning" />
              {flag.message}
            </li>
          ))}
        </ul>
      ) : null}
      {!detail ? <p className="text-xs text-fg-3">Checking this section…</p> : null}
    </div>
  );
}

export function ChoiceCard({
  termCode,
  choice,
  details,
  sections,
  slotLabels,
  slotFillers,
  conflicting,
  isFirst,
  isLast,
  disabled,
  onMove,
  onRemove,
  onAddAlternate,
  onPromote,
  onRemoveAlternate,
}: ChoiceCardProps) {
  const detail = details[choice.crn];
  const section = sections[choice.crn];
  const { courseCode, letter, label } = codeOf(choice.crn, choice.courseCode, detail, section);
  const title = detail?.title ?? section?.title ?? "";
  const headingId = `choice-${choice.crn}`;

  return (
    <li
      aria-labelledby={headingId}
      data-testid="webtree-choice"
      data-crn={choice.crn}
      className="rounded-lg border border-line bg-surface p-3 md:p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-wash font-mono text-sm font-semibold text-primary"
        >
          {choice.rank}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            tabIndex={-1}
            className="flex flex-wrap items-baseline gap-x-2 text-base font-strong text-fg"
          >
            <span className="sr-only">Choice {choice.rank}: </span>
            <CourseCode code={courseCode} section={letter ?? undefined} size="md" />
            <span className="min-w-0">{title}</span>
          </h3>
          <p className="mt-0.5 font-mono text-xs text-fg-2">
            CRN <span className="select-all">{choice.crn}</span>
          </p>
          <div className="mt-2">
            <SectionFacts
              crn={choice.crn}
              termCode={termCode}
              courseCode={courseCode}
              detail={detail}
              section={section}
              slotLabels={slotLabels}
              slotFillers={slotFillers}
              conflict={conflicting.has(choice.crn)}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-focus={`${choice.crn}-up`}
          disabled={isFirst || disabled}
          onClick={() => onMove("up")}
        >
          <ArrowUp aria-hidden />
          Move up <span className="sr-only">{label}</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-focus={`${choice.crn}-down`}
          disabled={isLast || disabled}
          onClick={() => onMove("down")}
        >
          <ArrowDown aria-hidden />
          Move down <span className="sr-only">{label}</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={onAddAlternate}
        >
          <Plus aria-hidden />
          Add alternate <span className="sr-only">for {label}</span>
        </Button>
        <ConfirmButton
          question={`Remove ${label} from the list?`}
          confirmLabel="Yes, remove"
          disabled={disabled}
          onConfirm={onRemove}
        >
          <Trash2 aria-hidden />
          Remove <span className="sr-only">{label}</span>
        </ConfirmButton>
      </div>

      {choice.alternates.length > 0 ? (
        <div className="mt-3 border-t border-line pt-3">
          <h4 className="text-xs font-semibold tracking-label text-fg-3 uppercase">
            Alternates for choice {choice.rank}
          </h4>
          <ol
            className="mt-2 flex flex-col gap-3"
            aria-label={`Alternates for choice ${choice.rank}`}
          >
            {choice.alternates.map((crn) => {
              const altDetail = details[crn];
              const altSection = sections[crn];
              const alt = codeOf(crn, choice.courseCode, altDetail, altSection);
              return (
                <li
                  key={crn}
                  data-testid="webtree-alternate"
                  data-crn={crn}
                  className="pl-2 md:pl-3"
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-fg">
                    <CourseCode code={alt.courseCode} section={alt.letter ?? undefined} />
                    <span>{altDetail?.title ?? altSection?.title ?? ""}</span>
                    <span className="font-mono text-xs font-normal text-fg-2">
                      CRN <span className="select-all">{crn}</span>
                    </span>
                  </p>
                  <div className="mt-1">
                    <SectionFacts
                      crn={crn}
                      termCode={termCode}
                      courseCode={alt.courseCode}
                      detail={altDetail}
                      section={altSection}
                      slotLabels={slotLabels}
                      slotFillers={slotFillers}
                      conflict={conflicting.has(crn)}
                      compact
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 print:hidden">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={disabled || (altDetail ? !altDetail.found : false)}
                      onClick={() => onPromote(crn)}
                    >
                      Make choice {choice.rank} <span className="sr-only">({alt.label})</span>
                    </Button>
                    <ConfirmButton
                      question={`Remove alternate ${alt.label}?`}
                      confirmLabel="Yes, remove"
                      disabled={disabled}
                      onConfirm={() => onRemoveAlternate(crn)}
                    >
                      <Trash2 aria-hidden />
                      Remove alternate <span className="sr-only">{alt.label}</span>
                    </ConfirmButton>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </li>
  );
}
