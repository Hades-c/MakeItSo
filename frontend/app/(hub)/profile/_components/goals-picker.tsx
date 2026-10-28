"use client";

import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { ToggleChip } from "@/components/ui/chip";
import { callApi } from "@/lib/api/client";
import { profileEndpoints } from "@/lib/api/endpoints";
import { GOALS, isGoalSlug } from "@/lib/goals";
import { describeFailure } from "../_lib/errors";
import { useSerialSave } from "../_lib/use-serial-save";

/**
 * Goals (lib/goals.ts: what the student hopes to do at Davidson, a second, unrelated taxonomy next to the career
 * interests; onboarding asks for both in its last step). Each chip saves at once, the same way InterestsPicker
 * does (optimistic; saves are serialised and a failure puts the chips back as the server has them).
 */

const HEADING_ID = "goals-heading";

async function saveGoals(next: string[]): Promise<string[]> {
  const { profile } = await callApi(profileEndpoints.update, { body: { goals: next } });
  return profile.goals;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((slug) => b.includes(slug));
}

export function GoalsPicker({ initial }: { initial: string[] }) {
  const goals = useSerialSave(initial.filter(isGoalSlug), saveGoals, sameSet);
  const chosen = goals.value;
  const failure = goals.status === "error" ? describeFailure(goals.error) : null;

  function toggle(slug: string) {
    goals.set(chosen.includes(slug) ? chosen.filter((s) => s !== slug) : [...chosen, slug]);
  }

  return (
    <div
      role="group"
      aria-labelledby={HEADING_ID}
      className="flex flex-col gap-3 border-t border-line pt-5"
    >
      <div>
        <h3 id={HEADING_ID} className="text-base font-strong text-fg">
          Goals at Davidson
        </h3>
        <p className="mt-0.5 text-sm text-fg-2">
          Optional. What you hope to do while you are here. With AI features on, career plans use
          these too.
        </p>
      </div>
      {failure ? (
        <FormAlert title="Your goals were not saved">
          {failure.issues[0]?.message ?? failure.message}
        </FormAlert>
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {GOALS.map((goal) => (
          <li key={goal.slug} className="max-w-full min-w-0">
            <ToggleChip wrap pressed={chosen.includes(goal.slug)} onClick={() => toggle(goal.slug)}>
              {goal.label}
            </ToggleChip>
          </li>
        ))}
      </ul>
      <p role="status" className="text-sm text-fg-2" data-testid="goals-status">
        {goals.status === "saving"
          ? "Saving…"
          : `${chosen.length} of ${GOALS.length} chosen${goals.status === "saved" ? ", saved" : ""}.`}
      </p>
    </div>
  );
}
