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
import { nextStep, stepHref } from "../_lib/steps";
import { StepActions, useSetupNext } from "./parts";

/**
 * Step 5, goals (PLAN-UX §8): a small fixed taxonomy of what the student hopes to get out of Davidson
 * (lib/goals.ts), unrelated to the career-path interests of step 6. "Save and continue" sends
 * PATCH /api/profile { goals } and moves to the next step; "Skip this step" moves on without saving.
 */

export interface GoalsStepProps {
  initial: readonly string[];
}

export function GoalsStep({ initial }: GoalsStepProps) {
  const router = useRouter();
  const after = useSetupNext();
  const [chosen, setChosen] = useState<string[]>(() => initial.filter(isGoalSlug));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(slug: string) {
    setChosen((list) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await callApi(profileEndpoints.update, { body: { goals: chosen } });
      router.push(stepHref(nextStep("goals") ?? "interests", after));
    } catch (caught) {
      setError(describeFailure(caught).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5" aria-label="Goals">
      {error ? <FormAlert title="Not saved">{error}</FormAlert> : null}
      <ul className="flex flex-wrap gap-2" role="group" aria-label="Goals">
        {GOALS.map((goal) => (
          <li key={goal.slug} className="max-w-full min-w-0">
            <ToggleChip
              wrap
              pressed={chosen.includes(goal.slug)}
              onClick={() => toggle(goal.slug)}
              data-slug={goal.slug}
            >
              {goal.label}
            </ToggleChip>
          </li>
        ))}
      </ul>
      <p role="status" className="text-sm text-fg-2" data-testid="goals-count">
        {chosen.length === 0
          ? "None chosen yet. You can change these any time on your profile."
          : `${chosen.length} chosen.`}
      </p>
      <StepActions
        step="goals"
        primary={
          <Button type="submit" aria-disabled={saving || undefined}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        }
      />
    </form>
  );
}
