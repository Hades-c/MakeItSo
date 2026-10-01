import { PlanMap } from "@/components/domain/plan-map";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { StatNumber } from "@/components/ui/stat-number";
import { routes } from "@/lib/routes";
import { isTermCode, termCodeFor } from "@/lib/term";
import { degreeMapTerms, loadPlan, loadProfile, loadProgress, loadTerms } from "@/server/today";
import { PanelError } from "./panel-states";

export const DEGREE_DISCLAIMER = "Unofficial — verify in Degree Works";

/**
 * Degree progress (PLAN §3 degree map): credits done of the 32 Davidson requires (server/plan getProgress, the
 * requirements engine's count) and the compact Lakeside PlanMap of the student's terms × credit slots, linking to
 * the 4-year plan. Unofficial, and says so.
 */
export async function DegreePanel({ userId }: { userId: string }) {
  const [progress, plan, profile, terms] = await Promise.all([
    loadProgress(userId),
    loadPlan(userId),
    loadProfile(userId),
    loadTerms(),
  ]);
  if (!progress.ok || !plan.ok || !profile.ok) {
    return <PanelError id="degree" title="Degree progress" what="Your degree progress" />;
  }
  const { graduationYear } = profile.value;
  const firstTerm =
    profile.value.firstTerm && isTermCode(profile.value.firstTerm)
      ? profile.value.firstTerm
      : termCodeFor("Fall", graduationYear - 4);
  const mapTerms = degreeMapTerms({
    items: plan.value.items,
    firstTerm,
    graduationYear,
    currentTerm: terms.ok ? terms.value.current : null,
  });
  const { creditsDone, creditsPlanned, required } = progress.value;
  const ahead = Math.max(0, creditsPlanned - creditsDone);

  return (
    <SectionCard
      id="degree"
      title="Degree progress"
      link={{ href: routes.plan("four-year"), label: "My plan" }}
    >
      <div data-aggregated="my-plan" data-testid="degree-progress">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <StatNumber
            value={<span data-testid="credits-done">{creditsDone}</span>}
            label={`of ${required} credits done`}
          />
          <SourceTag source="my-plan" />
        </div>
        <p className="mt-1 text-sm text-fg-2">
          {ahead === 0
            ? "Nothing in progress or planned yet."
            : `${ahead} more ${ahead === 1 ? "credit" : "credits"} in progress or planned.`}
        </p>
        <div className="mt-4">
          <PlanMap
            variant="compact"
            terms={mapTerms}
            requiredCredits={required}
            {...(terms.ok ? { highlightTermCode: terms.value.current } : {})}
            label="Your four-year plan"
          />
        </div>
        <p className="mt-3 text-xs text-fg-3">{DEGREE_DISCLAIMER}</p>
      </div>
    </SectionCard>
  );
}
