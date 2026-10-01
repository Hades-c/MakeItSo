"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api/client";
import { profileApi } from "@/lib/api/profile";
import { routes } from "@/lib/routes";
import { describeFailure } from "../_lib/errors";

/**
 * "Skip setup": marks onboarding done without saving anything else (PATCH /api/profile { onboarded: true }), so
 * the student is not sent back here, and opens Today. Everything stays editable on Profile and Plan.
 */
export function SkipSetup() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function skip() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await callApi(profileApi.update, { body: { onboarded: true } });
      router.push(routes.today());
      router.refresh();
    } catch (caught) {
      setError(describeFailure(caught).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={skip} aria-disabled={saving || undefined}>
        {saving ? "Saving…" : "Skip setup"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
