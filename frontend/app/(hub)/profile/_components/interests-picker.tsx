"use client";

import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { ToggleChip } from "@/components/ui/chip";
import { callApi } from "@/lib/api/client";
import { profileApi } from "@/lib/api/profile";
import { describeFailure } from "../_lib/errors";
import type { CareerOption } from "../_lib/load";
import { useSerialSave } from "../_lib/use-serial-save";

/**
 * Career interests (PLAN §3: one taxonomy = the career-path slugs from server/content). Each chip saves at once
 * (optimistic; saves are serialised and a failure puts the chips back as the server has them).
 */

async function saveInterests(next: string[]): Promise<string[]> {
  const { profile } = await callApi(profileApi.update, { body: { interests: next } });
  return profile.interests;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((slug) => b.includes(slug));
}

export interface InterestsPickerProps {
  initial: string[];
  careers: readonly CareerOption[];
}

export function InterestsPicker({ initial, careers }: InterestsPickerProps) {
  const interests = useSerialSave(initial, saveInterests, sameSet);
  const clusters = [...new Set(careers.map((career) => career.cluster))];
  const chosen = interests.value;
  const failure = interests.status === "error" ? describeFailure(interests.error) : null;
  const known = chosen.filter((slug) => careers.some((career) => career.slug === slug));

  function toggle(slug: string) {
    interests.set(chosen.includes(slug) ? chosen.filter((s) => s !== slug) : [...chosen, slug]);
  }

  return (
    <div className="flex flex-col gap-4">
      {failure ? (
        <FormAlert title="Your interests were not saved">
          {failure.issues[0]?.message ?? failure.message}
        </FormAlert>
      ) : null}
      {clusters.map((cluster) => {
        const headingId = `interests-${cluster.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <div key={cluster} role="group" aria-labelledby={headingId}>
            <h3
              id={headingId}
              className="mb-2 font-mono text-xs font-medium tracking-label text-fg-3 uppercase"
            >
              {cluster}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {careers
                .filter((career) => career.cluster === cluster)
                .map((career) => (
                  <li key={career.slug}>
                    <ToggleChip
                      pressed={chosen.includes(career.slug)}
                      onClick={() => toggle(career.slug)}
                    >
                      {career.name}
                    </ToggleChip>
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
      <p role="status" className="text-sm text-fg-2" data-testid="interests-status">
        {interests.status === "saving"
          ? "Saving…"
          : `${known.length} of ${careers.length} chosen${interests.status === "saved" ? ", saved" : ""}.`}
      </p>
    </div>
  );
}
