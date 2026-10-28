"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { callApi } from "@/lib/api/client";
import { profileEndpoints } from "@/lib/api/endpoints";
import { routes } from "@/lib/routes";

/**
 * A one-time notice for accounts that finished onboarding before the Syllabi and Goals steps existed (PLAN-UX
 * §8). Shown once on Today; "Add them now" opens onboarding at the Syllabi step (and does not itself count as
 * dismissing: the notice can always be reached again from there until Dismiss is pressed). Dismiss sets
 * newStepsPromptDismissedAt once (PATCH /api/profile { dismissNewStepsPrompt: true }) and hides the notice right
 * away, in this client island, without a full page refresh.
 */
export function NewStepsPrompt() {
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await callApi(profileEndpoints.update, { body: { dismissNewStepsPrompt: true } });
      setHidden(true);
    } catch {
      setError("Could not save. It will show again next time.");
      setSaving(false);
    }
  }

  if (hidden) return null;

  return (
    <div className="mb-5">
      <section
        aria-labelledby="new-steps-title"
        data-testid="new-steps-prompt"
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex items-start gap-3">
          <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-2" />
          <div>
            <h2 id="new-steps-title" className="text-base font-strong text-fg">
              New: syllabi and goals
            </h2>
            <p className="mt-0.5 text-sm text-fg-2">
              Upload a syllabus to pull its deadlines into your plan, and tell MakeItSo what you are
              hoping to get out of Davidson.
            </p>
            {error ? <FieldError role="alert">{error}</FieldError> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="secondary">
            <Link href={routes.onboarding("syllabi")} prefetch={false}>
              Add them now
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            aria-disabled={saving || undefined}
            onClick={() => void dismiss()}
          >
            <X aria-hidden />
          </Button>
        </div>
      </section>
    </div>
  );
}
