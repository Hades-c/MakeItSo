"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { callApi } from "@/lib/api/client";
import { profileEndpoints } from "@/lib/api/endpoints";
import { GOALS, isGoalSlug } from "@/lib/goals";
import { describeFailure } from "../_lib/errors";
import type { CareerOption } from "../_lib/load";
import { afterSetupHref } from "../_lib/steps";
import { StepActions, useSetupNext } from "./parts";

/**
 * Step 4, interests and goals: career paths to explore (the career-path slugs from server/content), then,
 * optionally, what the student hopes to do at Davidson (the goal slugs of lib/goals.ts, a second, unrelated
 * taxonomy). "Finish" saves both and marks onboarding done (PATCH /api/profile { interests, goals, onboarded: true };
 * the server sets onboardedAt once, so a re-run keeps the first date), then opens Today (or the page the student
 * first asked for: `?next=`). Both stay editable in Profile → Interests.
 */

const GOALS_HEADING_ID = "onboarding-goals";

export interface InterestsStepProps {
  initial: string[];
  initialGoals: readonly string[];
  careers: readonly CareerOption[];
}

function toggled(list: readonly string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

/** "2 career paths and 1 goal chosen." */
function countLine(careers: number, goals: number): string {
  if (careers === 0 && goals === 0) {
    return "None chosen yet. You can change these any time on your profile.";
  }
  const parts = [
    careers > 0 ? `${careers} career ${careers === 1 ? "path" : "paths"}` : null,
    goals > 0 ? `${goals} ${goals === 1 ? "goal" : "goals"}` : null,
  ].filter(Boolean);
  return `${parts.join(" and ")} chosen.`;
}

export function InterestsStep({ initial, initialGoals, careers }: InterestsStepProps) {
  const router = useRouter();
  const after = useSetupNext();
  const known = new Set(careers.map((career) => career.slug));
  const [chosen, setChosen] = useState<string[]>(() => initial.filter((slug) => known.has(slug)));
  const [goals, setGoals] = useState<string[]>(() => initialGoals.filter(isGoalSlug));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clusters = [...new Set(careers.map((career) => career.cluster))];

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await callApi(profileEndpoints.update, {
        body: { interests: chosen, goals, onboarded: true },
      });
      router.push(afterSetupHref(after));
      router.refresh();
    } catch (caught) {
      setError(describeFailure(caught).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={finish} noValidate className="flex flex-col gap-5" aria-label="Interests">
      {error ? <FormAlert title="Not saved">{error}</FormAlert> : null}
      {clusters.map((cluster) => {
        const headingId = `onboarding-interests-${cluster.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <div key={cluster} role="group" aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="mb-2 text-xs font-medium tracking-label text-fg-3 uppercase"
            >
              {cluster}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {careers
                .filter((career) => career.cluster === cluster)
                .map((career) => (
                  <li key={career.slug} className="max-w-full min-w-0">
                    <ToggleChip
                      wrap
                      pressed={chosen.includes(career.slug)}
                      onClick={() => setChosen((list) => toggled(list, career.slug))}
                      data-slug={career.slug}
                    >
                      {career.name}
                    </ToggleChip>
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
      <div
        role="group"
        aria-labelledby={GOALS_HEADING_ID}
        aria-describedby={`${GOALS_HEADING_ID}-hint`}
        className="border-t border-line pt-5"
      >
        <h2 id={GOALS_HEADING_ID} className="text-base font-strong text-fg">
          Goals at Davidson
        </h2>
        <p id={`${GOALS_HEADING_ID}-hint`} className="mt-0.5 mb-3 text-sm text-fg-2">
          Optional. What you hope to do while you are here. With AI features on, career plans and
          cold-email drafts use these too.
        </p>
        <ul className="flex flex-wrap gap-2">
          {GOALS.map((goal) => (
            <li key={goal.slug} className="max-w-full min-w-0">
              <ToggleChip
                wrap
                pressed={goals.includes(goal.slug)}
                onClick={() => setGoals((list) => toggled(list, goal.slug))}
                data-slug={goal.slug}
              >
                {goal.label}
              </ToggleChip>
            </li>
          ))}
        </ul>
      </div>
      <p role="status" className="text-sm text-fg-2" data-testid="interests-count">
        {countLine(chosen.length, goals.length)}
      </p>
      <StepActions
        step="interests"
        primary={
          <Button type="submit" aria-disabled={saving || undefined}>
            {saving ? "Saving…" : "Finish"}
          </Button>
        }
      />
    </form>
  );
}
