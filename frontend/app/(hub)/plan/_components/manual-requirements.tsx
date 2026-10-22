"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import type { PlanView } from "@/lib/types/plan";
import { PE_LIFETIME_REQUIRED } from "../_lib/four-year";
import { Notice } from "./notice";
import { usePlanAction } from "./use-plan-action";

/**
 * The requirements the course data cannot show (PLAN §5 (e), (f)): a language proficiency/exemption toggle, and
 * the PE checklist (2 Lifetime Activity + 1 Team Sport; PE is not in the course API). Each change is saved at
 * once (PATCH /api/plan/manual) and the tracker refreshes.
 */
export function ManualRequirements({ manual }: { manual: PlanView["manual"] }) {
  const id = React.useId();
  const [state, setState] = React.useState(manual);
  const action = usePlanAction();

  // A refresh brings the server's values: adopt them (during render, not in an effect).
  const [synced, setSynced] = React.useState(manual);
  if (synced !== manual) {
    setSynced(manual);
    setState(manual);
  }

  const save = async (patch: Partial<PlanView["manual"]>, next: PlanView["manual"]) => {
    const previous = state;
    setState(next);
    const result = await action.run(() => callApi(planApi.updateManual, { body: patch }), {
      fallback: "Could not save that. Please try again.",
    });
    if (!result.ok) setState(previous);
  };

  const setLifetime = (index: number, checked: boolean) => {
    const count = Math.max(0, Math.min(PE_LIFETIME_REQUIRED, checked ? index + 1 : index));
    const pe = { ...state.pe, lifetimeActivities: count };
    void save({ pe }, { ...state, pe });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="manual-requirements">
      <div>
        <h3 className="text-sm font-semibold text-fg">Language</h3>
        <div className="mt-2 flex min-h-11 items-center gap-3">
          <Switch
            id={`${id}-lang`}
            checked={state.languageExempt}
            disabled={action.busy}
            onCheckedChange={(checked) =>
              void save({ languageExempt: checked }, { ...state, languageExempt: checked })
            }
          />
          <Label htmlFor={`${id}-lang`}>I have language proficiency or an exemption</Label>
        </div>
        <p className="text-xs text-fg-3">
          Turn this on only if the Registrar has recorded your proficiency or exemption.
        </p>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-fg">Physical Education</legend>
        <p className="text-xs text-fg-3">
          PE courses are not in the course schedule: tick them off here.
        </p>
        <div className="mt-2 flex flex-col">
          {Array.from({ length: PE_LIFETIME_REQUIRED }, (_, index) => (
            <div key={index} className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`${id}-pe-${index}`}
                checked={state.pe.lifetimeActivities > index}
                disabled={action.busy}
                onCheckedChange={(checked) => setLifetime(index, checked === true)}
              />
              <Label htmlFor={`${id}-pe-${index}`}>
                {index === 0 ? "First" : "Second"} Lifetime Activity course done
              </Label>
            </div>
          ))}
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={`${id}-pe-team`}
              checked={state.pe.teamSport}
              disabled={action.busy}
              onCheckedChange={(checked) => {
                const pe = { ...state.pe, teamSport: checked === true };
                void save({ pe }, { ...state, pe });
              }}
            />
            <Label htmlFor={`${id}-pe-team`}>Team Sport course done</Label>
          </div>
        </div>
      </fieldset>
      <div aria-live="polite">
        <Notice tone="error">{action.error}</Notice>
      </div>
    </div>
  );
}
