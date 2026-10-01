"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListOrdered, TriangleAlert } from "lucide-react";
import { WeekGrid } from "@/components/domain/week-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { SourceTag } from "@/components/ui/source-tag";
import { callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import type { PlanWarning, RequirementSlot, ScheduleConflict, WebTreeList } from "@/lib/types/plan";
import type { SlotFiller } from "../_lib/choice";
import { errorMessage } from "../_lib/errors";
import {
  conflictingCrns,
  conflictLines,
  gridHours,
  weekBlocks,
  type SectionTimes,
} from "../_lib/week";
import {
  addAlternate,
  addChoice,
  moveChoice,
  normalizeRanks,
  promoteAlternate,
  removeAlternate,
  removeChoice,
  sameList,
  type EditResult,
} from "../_lib/webtree-edit";
import { AddCourse, type AddTarget, type PickedSection } from "./add-course";
import { ChoiceCard, type SectionDetail } from "./choice-card";
import { CopyForWebTree } from "./copy-for-webtree";
import { Notice } from "./notice";

/**
 * The WebTree list (PLAN §5 "WebTree list", R1): ranked choices with alternates for the registration term. Every
 * edit (reorder with Move up / Move down, add from the plan or a search, alternates, remove) shows at once and is
 * saved as the whole list (PUT /api/plan/webtree); then the server components refresh with the plan service's
 * report: seats, slots, restriction flags, the conflict check across choices and alternates, and the "Copy for
 * WebTree" text. Saves run one after another, so quick presses never race. Moving a choice keeps keyboard focus
 * on the control that moved it.
 */

export interface WebTreeEditorProps {
  termCode: string;
  termLabel: string;
  list: WebTreeList;
  details: Readonly<Record<string, SectionDetail>>;
  sections: Readonly<Record<string, SectionTimes & { instructors?: string[] }>>;
  conflicts: readonly ScheduleConflict[];
  warnings: readonly PlanWarning[];
  copyText: string;
  planCourses: readonly { courseCode: string; title: string; crn: string | null }[];
  slotLabels: Readonly<Record<RequirementSlot, string>>;
  slotFillers: Readonly<Partial<Record<RequirementSlot, SlotFiller>>>;
}

export function WebTreeEditor(props: WebTreeEditorProps) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [list, setList] = React.useState<WebTreeList>(props.list);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("");
  const [target, setTarget] = React.useState<AddTarget>("new");
  const [added, setAdded] = React.useState<
    Record<string, SectionTimes & { instructors?: string[] }>
  >({});
  const queued = React.useRef<WebTreeList | null>(null);
  const inFlight = React.useRef(false);
  const serverList = React.useRef(props.list);
  const focusAfter = React.useRef<string | null>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const searchBox = React.useRef<HTMLInputElement>(null);

  // A refresh brings the server's list: adopt it unless an edit is still on its way.
  React.useEffect(() => {
    serverList.current = props.list;
    if (!inFlight.current && !queued.current) setList(props.list);
  }, [props.list]);

  React.useLayoutEffect(() => {
    const key = focusAfter.current;
    if (!key || !root.current) return;
    focusAfter.current = null;
    const [crn, direction] = key.split("-");
    const wanted = root.current.querySelector<HTMLButtonElement>(`[data-focus="${key}"]`);
    const other = root.current.querySelector<HTMLButtonElement>(
      `[data-focus="${crn}-${direction === "up" ? "down" : "up"}"]`,
    );
    (wanted && !wanted.disabled ? wanted : other)?.focus();
  }, [list]);

  const flush = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    let failed = false;
    while (queued.current) {
      const next = queued.current;
      queued.current = null;
      try {
        await callApi(planApi.saveWebTree, { body: next });
      } catch (caught) {
        failed = true;
        queued.current = null;
        setError(errorMessage(caught, "Your WebTree list could not be saved. Please try again."));
        setList(serverList.current);
        setStatus("Not saved.");
        break;
      }
    }
    inFlight.current = false;
    setSaving(false);
    if (!failed) setStatus("Saved.");
    startTransition(() => router.refresh());
  }, [router]);

  const commit = (result: EditResult, message: string, focusKey?: string): boolean => {
    if (!result.ok) {
      setError(result.reason);
      return false;
    }
    setError(null);
    focusAfter.current = focusKey ?? null;
    setList(result.list);
    queued.current = result.list;
    setStatus(`${message} Saving…`);
    void flush();
    return true;
  };

  const sections = { ...added, ...props.sections };
  const choices = normalizeRanks(list.choices);
  const labelOf = (crn: string, fallback: string) => {
    const section = sections[crn];
    return section ? `${section.courseCode} ${section.section}` : fallback;
  };

  const onAdd = (section: PickedSection, where: AddTarget) => {
    setAdded((previous) => ({ ...previous, [section.crn]: section }));
    const result =
      where === "new"
        ? addChoice(list, { crn: section.crn, courseCode: section.courseCode })
        : addAlternate(list, where, section.crn);
    const label = `${section.courseCode} ${section.section}`;
    if (
      commit(
        result,
        where === "new"
          ? `Added ${label} as choice ${list.choices.length + 1}.`
          : `Added ${label} as an alternate for choice ${where}.`,
      )
    ) {
      setTarget("new");
    }
  };

  const dirty = saving || !sameList(list, props.list);
  const blocks = weekBlocks(list, sections, props.conflicts);
  const hours = gridHours(blocks);
  const conflicting = conflictingCrns(props.conflicts);
  const lines = conflictLines(list, sections, props.conflicts);
  // Restriction flags show on their section; the rest (retakes, sections gone from the schedule) show here.
  const flagKeys = new Set(
    Object.values(props.details).flatMap((detail) =>
      detail.flags.map((flag) => `${flag.code}|${flag.message}`),
    ),
  );
  const generalWarnings = props.warnings.filter(
    (warning) => !flagKeys.has(`${warning.code}|${warning.message}`),
  );

  return (
    <div ref={root} className="flex flex-col gap-5" data-testid="webtree-editor">
      <div aria-live="polite" className="sr-only" data-testid="webtree-status">
        {status}
      </div>
      <Notice tone="error" role="alert">
        {error}
      </Notice>

      {choices.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title={`No ${props.termLabel} choices yet`}
          description={
            <p>
              Add the sections you want, in order of preference, with alternates in case a section
              fills. MakeItSo checks them for time conflicts and gives you the CRNs to enter in
              WebTree yourself.
            </p>
          }
        />
      ) : (
        <ol aria-label={`${props.termLabel} WebTree choices`} className="flex flex-col gap-3">
          {choices.map((choice, index) => {
            const label = labelOf(choice.crn, choice.courseCode);
            return (
              <ChoiceCard
                key={choice.crn}
                termCode={props.termCode}
                choice={choice}
                details={props.details}
                sections={sections}
                slotLabels={props.slotLabels}
                slotFillers={props.slotFillers}
                conflicting={conflicting}
                isFirst={index === 0}
                isLast={index === choices.length - 1}
                disabled={false}
                onMove={(direction) =>
                  commit(
                    moveChoice(list, choice.rank, direction),
                    `Moved ${label} to choice ${direction === "up" ? choice.rank - 1 : choice.rank + 1}.`,
                    `${choice.crn}-${direction}`,
                  )
                }
                onRemove={() =>
                  commit(removeChoice(list, choice.rank), `Removed ${label} from the list.`)
                }
                onAddAlternate={() => {
                  setTarget(choice.rank);
                  searchBox.current?.focus();
                  setStatus(`Adding an alternate for choice ${choice.rank}, ${label}.`);
                }}
                onPromote={(crn) => {
                  const section = sections[crn];
                  const code =
                    section?.courseCode ?? props.details[crn]?.courseCode ?? choice.courseCode;
                  commit(
                    promoteAlternate(list, choice.rank, crn, code),
                    `${labelOf(crn, code)} is now choice ${choice.rank}; ${label} became its alternate.`,
                  );
                }}
                onRemoveAlternate={(crn) =>
                  commit(
                    removeAlternate(list, choice.rank, crn),
                    `Removed alternate ${labelOf(crn, crn)}.`,
                  )
                }
              />
            );
          })}
        </ol>
      )}

      <section
        aria-labelledby="webtree-add-title"
        className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 print:hidden"
      >
        <h3 id="webtree-add-title" className="text-lg font-strong tracking-title text-fg">
          Add a course
        </h3>
        <div className="mt-3">
          <AddCourse
            termCode={props.termCode}
            termLabel={props.termLabel}
            list={list}
            planCourses={props.planCourses}
            target={target}
            onTargetChange={setTarget}
            onAdd={onAdd}
            searchRef={searchBox}
          />
        </div>
      </section>

      {choices.length > 0 ? (
        <section
          aria-labelledby="webtree-conflicts-title"
          className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5"
        >
          <h3
            id="webtree-conflicts-title"
            className="flex items-center gap-2 text-lg font-strong tracking-title text-fg"
          >
            Conflict check <SourceTag source="course-schedule" />
          </h3>
          <div className="mt-2" data-testid="webtree-conflicts">
            {dirty ? (
              <p className="text-sm text-fg-2">Checking your changes…</p>
            ) : lines.length === 0 ? (
              <Notice tone="success">
                No time conflicts among your choices and alternates (sections with “Time TBA” are
                not checked).
              </Notice>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {lines.map((line) => (
                  <li key={line.key} className="flex items-start gap-1.5 text-sm text-fg">
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
                    <span>
                      {line.text}
                      {line.betweenChoices ? null : (
                        <span className="text-fg-2"> Only matters if you end up in both.</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {generalWarnings.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1" aria-label="Other checks">
              {generalWarnings.map((warning) => (
                <li
                  key={`${warning.code}-${warning.message}`}
                  className="flex items-start gap-1.5 text-sm text-fg"
                >
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4">
            <WeekGrid
              startHour={hours.startHour}
              endHour={hours.endHour}
              blocks={blocks}
              label={`Your ${props.termLabel} week with every first choice`}
            />
          </div>
        </section>
      ) : null}

      {choices.length > 0 ? (
        <section
          aria-labelledby="webtree-copy-title"
          className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 print:hidden"
        >
          <h3 id="webtree-copy-title" className="text-lg font-strong tracking-title text-fg">
            Take it to WebTree
          </h3>
          <p className="mt-1 text-sm text-fg-2">
            MakeItSo never signs in to WebTree for you. Copy the list, then enter each CRN in
            WebTree yourself while preferences are open.
          </p>
          <div className="mt-3">
            <CopyForWebTree
              text={props.copyText}
              disabled={dirty}
              disabledReason="Saving your changes…"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
