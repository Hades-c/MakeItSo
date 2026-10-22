"use client";

import { useCallback, useRef, useState } from "react";
import { ApiClientError, callApi } from "@/lib/api/client";
import { planApi, type AddPlanItemBody, type UpdatePlanItemBody } from "@/lib/api/plan";
import type { PlanItem, PlanWarning } from "@/lib/types/plan";
import { describeFailure, type Failure } from "../_lib/errors";

/**
 * The student's plan items for steps 2 and 3, kept in the browser and changed only through the plan API (W5s:
 * atomic adds with the (termCode, canonicalCode) key, $pull removes, positional patches). A 409 means the course
 * is already there (a re-run, another tab): the hook reloads the plan and reports it as "already in your plan"
 * instead of an error. One change at a time: a second click while a change is in flight is ignored.
 */

export type ChangeResult =
  { ok: true; item?: PlanItem; warnings: PlanWarning[] } | { ok: false; failure: Failure };

export function usePlanItems(initial: readonly PlanItem[]) {
  const [items, setItems] = useState<PlanItem[]>(() => [...initial]);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    try {
      const { plan } = await callApi(planApi.getPlan, {});
      setItems(plan.items);
    } catch {
      // Keep what is shown; the next change re-checks on the server anyway.
    }
  }, []);

  const run = useCallback(
    async (key: string, change: () => Promise<ChangeResult>): Promise<ChangeResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(key);
      try {
        return await change();
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [],
  );

  const failed = useCallback(
    async (caught: unknown): Promise<ChangeResult> => {
      const failure = describeFailure(caught);
      // 409: already there; 404: removed elsewhere. Either way, show the plan as the server has it.
      if (failure.conflict || (caught instanceof ApiClientError && caught.status === 404)) {
        await reload();
      }
      return { ok: false, failure };
    },
    [reload],
  );

  const add = useCallback(
    (key: string, body: AddPlanItemBody) =>
      run(key, async () => {
        try {
          const { item, warnings } = await callApi(planApi.addItem, { body });
          setItems((current) => [...current.filter((other) => other.id !== item.id), item]);
          return { ok: true, item, warnings };
        } catch (caught) {
          return failed(caught);
        }
      }),
    [failed, run],
  );

  /** PATCH one item (a CRN, a status, or both): never a second item for the same course. */
  const update = useCallback(
    (key: string, itemId: string, body: UpdatePlanItemBody) =>
      run(key, async () => {
        try {
          const { item, warnings } = await callApi(planApi.updateItem, {
            params: { id: itemId },
            body,
          });
          setItems((current) => current.map((other) => (other.id === item.id ? item : other)));
          return { ok: true, item, warnings };
        } catch (caught) {
          return failed(caught);
        }
      }),
    [failed, run],
  );

  const remove = useCallback(
    (key: string, itemId: string) =>
      run(key, async () => {
        try {
          await callApi(planApi.removeItem, { params: { id: itemId } });
          setItems((current) => current.filter((other) => other.id !== itemId));
          return { ok: true, warnings: [] };
        } catch (caught) {
          return failed(caught);
        }
      }),
    [failed, run],
  );

  return { items, busy, add, update, remove, reload };
}
