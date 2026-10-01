"use client";

import * as React from "react";
import type { AiFailure, AiOk } from "@/lib/types/ai";
import { aiErrorCopy, aiFailureCopy, type AiNoticeCopy, type AiStepLinks } from "./ai-result";

/**
 * One AI request at a time for a panel: `run()` calls the route, and the state is the answer (`ok`), the failure
 * kind turned into words with its next step (`failed`), or `loading`. A second click while a request is in flight
 * is ignored, and an answer that arrives after a newer request started is dropped.
 */

export type AiRequestState<T> =
  | { phase: "idle" }
  | { phase: "loading"; previous: AiOk<T> | null }
  | { phase: "ok"; result: AiOk<T> }
  | { phase: "failed"; copy: AiNoticeCopy; previous: AiOk<T> | null };

export function useAiRequest<T>(links: AiStepLinks) {
  const [state, setState] = React.useState<AiRequestState<T>>({ phase: "idle" });
  const latest = React.useRef(0);
  const busy = state.phase === "loading";

  const run = React.useCallback(
    async (request: () => Promise<AiOk<T> | AiFailure>) => {
      if (busy) return;
      const id = ++latest.current;
      const previous =
        state.phase === "ok" ? state.result : state.phase === "failed" ? state.previous : null;
      setState({ phase: "loading", previous });
      let next: AiRequestState<T>;
      try {
        const result = await request();
        next =
          result.kind === "ok"
            ? { phase: "ok", result }
            : { phase: "failed", copy: aiFailureCopy(result, links), previous };
      } catch (error) {
        next = { phase: "failed", copy: aiErrorCopy(error, links), previous };
      }
      if (id === latest.current) setState(next);
    },
    [busy, links, state],
  );

  const reset = React.useCallback(() => {
    latest.current++;
    setState({ phase: "idle" });
  }, []);

  return { state, run, busy, reset };
}
