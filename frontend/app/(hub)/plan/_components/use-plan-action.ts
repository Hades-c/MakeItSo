"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "../_lib/errors";

/**
 * Run one plan mutation from a client island: call the route (callApi), then refresh the server components so
 * every tab shows the plan service's own answer (credits, slots, warnings, conflicts). The error, if any, is one
 * sentence for the student; `busy` covers the request and the refresh.
 */
export function usePlanAction() {
  const router = useRouter();
  const [refreshing, startTransition] = React.useTransition();
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    async <T>(
      action: () => Promise<T>,
      options: { fallback: string; onError?: (error: unknown) => boolean },
    ): Promise<{ ok: true; value: T } | { ok: false }> => {
      setRunning(true);
      setError(null);
      try {
        const value = await action();
        startTransition(() => router.refresh());
        return { ok: true, value };
      } catch (caught) {
        // onError may handle it (e.g. a 409 that means "already there") and return true to stay quiet.
        if (!options.onError?.(caught)) setError(errorMessage(caught, options.fallback));
        return { ok: false };
      } finally {
        setRunning(false);
      }
    },
    [router],
  );

  return { run, busy: running || refreshing, error, setError };
}
