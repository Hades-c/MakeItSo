"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "../_lib/errors";

/**
 * Run one syllabus mutation from a client island: call the route, then refresh the server components (the
 * uploads list, its counts). Mirrors app/(hub)/plan/_components/use-plan-action.ts.
 */
export function useSyllabusAction() {
  const router = useRouter();
  const [refreshing, startTransition] = React.useTransition();
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    async <T>(
      action: () => Promise<T>,
      options: { fallback: string },
    ): Promise<{ ok: true; value: T } | { ok: false }> => {
      setRunning(true);
      setError(null);
      try {
        const value = await action();
        startTransition(() => router.refresh());
        return { ok: true, value };
      } catch (caught) {
        setError(errorMessage(caught, options.fallback));
        return { ok: false };
      } finally {
        setRunning(false);
      }
    },
    [router],
  );

  return { run, busy: running || refreshing, error, setError };
}
