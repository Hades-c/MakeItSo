import { History, TriangleAlert } from "lucide-react";
import { PlanMap } from "@/components/domain/plan-map";
import { RequirementSlots } from "@/components/domain/requirement-slots";
import { ErrorState } from "@/components/ui/error-state";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTagList } from "@/components/ui/source-tag";
import { isSummer, termLabel } from "@/lib/term";
import type { PlanItem } from "@/lib/types/plan";
import {
  canRetake,
  earlierCompletion,
  generalWarnings,
  groupByTerm,
  planMapTerms,
  requirementTiles,
  retakeNote,
  retakeTerms,
  warningsFor,
  type TermGroup,
} from "../_lib/four-year";
import { creditsText, formatNumber, plural } from "../_lib/labels";
import type { FourYearData, Loaded } from "../_lib/load";
import { ManualEntryForm } from "./manual-entry";
import { ManualRequirements } from "./manual-requirements";
import { Notice } from "./notice";
import { PlanItemRow } from "./plan-item-row";

/**
 * The 4-year plan (PLAN §3): the degree map, every term's courses with their status, P/F, move, retake and
 * remove, manual entries (transfer, AP, unlisted), the unofficial requirements tracker with the language toggle
 * and PE checklist, and the plan service's warnings. A plan converted from the hackathon version (legacy) says
 * so, and its courses the catalog could not confirm are flagged.
 */
export function FourYearTab({ loaded }: { loaded: Loaded<FourYearData> }) {
  if (!loaded.ok) {
    return <ErrorState title="Your plan could not load" description={loaded.message} />;
  }
  const { plan, progress, planTerms, current, registration, slotLabels } = loaded.data;
  const groups = groupByTerm(plan.items, planTerms, current, registration);
  const tiles = requirementTiles(progress, plan.items, slotLabels);
  const general = generalWarnings(progress.warnings);
  // Whether any AP/transfer credit is listed: the counted amount (capped, de-duplicated) is the plan service's
  // business and is already inside creditsDone, so no number is computed here.
  const hasPreCredit = plan.items.some(
    (item) => item.source === "ap" || item.source === "transfer",
  );
  const unverified = plan.items.filter((item) => item.unverified).length;

  // Where focus goes when a course is removed: its term's heading, or "Term by term" when the group goes away
  // with it ("Before Davidson", summers and terms outside the plan only show while they have courses).
  const headingFor = (item: PlanItem): string => {
    if (item.termCode === null) {
      return groups.beforeDavidson.length > 1 ? "term-before" : "plan-terms-title";
    }
    const code = item.termCode;
    const kept = planTerms.includes(code) && !isSummer(code);
    const count = plan.items.filter((other) => other.termCode === code).length;
    return kept || count > 1 ? `term-${code}` : "plan-terms-title";
  };

  const rowFor = (item: PlanItem) => {
    const earlier = earlierCompletion(item, plan.items);
    return (
      <PlanItemRow
        key={item.id}
        item={item}
        moveTerms={planTerms}
        retakeTerms={canRetake(item) ? retakeTerms(item, plan.items, planTerms, registration) : []}
        warnings={warningsFor(progress.warnings, item.id)}
        retakeNote={earlier ? retakeNote(earlier) : null}
        focusAfterRemove={headingFor(item)}
      />
    );
  };

  const termSection = (group: TermGroup, note?: string) => (
    <li key={group.termCode} data-testid="plan-term" data-term={group.termCode}>
      <section aria-labelledby={`term-${group.termCode}`}>
        <h3
          id={`term-${group.termCode}`}
          tabIndex={-1}
          className="flex flex-wrap items-baseline gap-x-2 text-base font-strong text-fg"
        >
          {group.label}
          {group.isCurrent ? <span className="text-xs font-semibold text-primary">Now</span> : null}
          {group.isRegistration ? (
            <span className="text-xs font-semibold text-primary">Registration term</span>
          ) : null}
          <span className="font-mono text-xs font-medium text-fg-3">
            {creditsText(group.credits)}
          </span>
        </h3>
        {note ? <p className="text-xs text-fg-2">{note}</p> : null}
        {group.items.length === 0 ? (
          <p className="mt-1.5 text-sm text-fg-3">Nothing planned yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">{group.items.map(rowFor)}</ul>
        )}
      </section>
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      {plan.legacy ? (
        <Notice tone="info" data-testid="legacy-plan">
          <p className="flex items-center gap-1.5 font-semibold text-fg">
            <History aria-hidden className="size-4" /> Converted from your earlier MakeItSo plan
          </p>
          <p>
            Your courses were brought over from the hackathon version of MakeItSo with their titles
            and credits from the Davidson catalog. Nothing is saved in the new format until you make
            a change.
            {unverified > 0
              ? ` ${plural(unverified, "course")} could not be found in the catalog: edit or remove ${unverified === 1 ? "it" : "them"}.`
              : ""}
          </p>
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <SectionCard id="degree-map" title="Degree progress" className="min-w-0">
          <PlanMap
            terms={planMapTerms(groups)}
            requiredCredits={progress.required}
            label="Your four-year plan"
          />
          <p className="mt-3 text-sm text-fg-2" data-testid="credit-summary">
            Unofficial count: {formatNumber(progress.creditsDone)} of {progress.required} credits
            done, {formatNumber(progress.creditsPlanned)} with courses in progress and planned.
            {hasPreCredit
              ? " These totals include the AP/transfer credit that counts, which is not shown on the map."
              : ""}
          </p>
          <SourceTagList
            label="Sources for your plan"
            sources={["my-plan", "course-schedule"]}
            className="mt-3"
          />
        </SectionCard>

        <SectionCard id="requirements" title="Requirements" className="min-w-0">
          <RequirementSlots
            slots={tiles}
            label="Requirements tracker"
            note={
              progress.rulesExact
                ? `Rules of the ${progress.catalogYear} Academic Regulations.`
                : `Your catalog year has no verified rules yet; the ${progress.catalogYear} rules are used.`
            }
          />
          <div className="mt-4 border-t border-line pt-4">
            <ManualRequirements manual={plan.manual} />
          </div>
        </SectionCard>
      </div>

      {general.length > 0 ? (
        <section aria-labelledby="plan-warnings-title" data-testid="plan-warnings">
          <h2 id="plan-warnings-title" className="text-lg font-strong tracking-title text-fg">
            Things to check
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {general.map((warning) => (
              <li
                key={`${warning.code}-${warning.message}`}
                className="flex items-start gap-2 rounded-md bg-warning-wash px-3 py-2 text-sm text-fg"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="plan-terms-title">
        <h2
          id="plan-terms-title"
          tabIndex={-1}
          className="text-lg font-strong tracking-title text-fg"
        >
          Term by term
        </h2>
        <ol className="mt-3 flex flex-col gap-5">
          {groups.beforeDavidson.length > 0 ? (
            <li data-testid="plan-term" data-term="none">
              <section aria-labelledby="term-before">
                <h3 id="term-before" tabIndex={-1} className="text-base font-strong text-fg">
                  Before Davidson (AP and transfer credit)
                </h3>
                <ul className="mt-2 flex flex-col gap-2">{groups.beforeDavidson.map(rowFor)}</ul>
              </section>
            </li>
          ) : null}
          {groups.terms.map((group) => termSection(group))}
          {groups.outside.map((group) =>
            termSection(
              group,
              `${termLabel(group.termCode)} is outside your plan’s terms: move these courses or remove them.`,
            ),
          )}
        </ol>
      </section>

      <SectionCard id="manual-entry" title="Add transfer, AP or another course">
        <ManualEntryForm terms={planTerms} />
      </SectionCard>
    </div>
  );
}
