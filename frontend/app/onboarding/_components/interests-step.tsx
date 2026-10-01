"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { callApi } from "@/lib/api/client";
import { profileApi } from "@/lib/api/profile";
import { routes } from "@/lib/routes";
import { describeFailure } from "../_lib/errors";
import type { CareerOption } from "../_lib/load";
import { StepActions } from "./parts";

/**
 * Step 4, interests (one taxonomy: the career-path slugs from server/content). "Finish" saves the chosen slugs
 * and marks onboarding done (PATCH /api/profile { interests, onboarded: true }; the server sets onboardedAt once,
 * so a re-run keeps the first date), then opens Today.
 */

export interface InterestsStepProps {
  initial: string[];
  careers: readonly CareerOption[];
}

export function InterestsStep({ initial, careers }: InterestsStepProps) {
  const router = useRouter();
  const known = new Set(careers.map((career) => career.slug));
  const [chosen, setChosen] = useState<string[]>(() => initial.filter((slug) => known.has(slug)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clusters = [...new Set(careers.map((career) => career.cluster))];

  function toggle(slug: string) {
    setChosen((list) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]));
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await callApi(profileApi.update, { body: { interests: chosen, onboarded: true } });
      router.push(routes.today());
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
              className="mb-2 font-mono text-xs font-medium tracking-label text-fg-3 uppercase"
            >
              {cluster}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {careers
                .filter((career) => career.cluster === cluster)
                .map((career) => (
                  <li key={career.slug}>
                    <ToggleChip
                      pressed={chosen.includes(career.slug)}
                      onClick={() => toggle(career.slug)}
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
      <p role="status" className="text-sm text-fg-2" data-testid="interests-count">
        {chosen.length === 0
          ? "None chosen yet. You can change these any time on your profile."
          : `${chosen.length} chosen.`}
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
