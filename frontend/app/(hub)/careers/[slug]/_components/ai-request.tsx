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

/**
 * Keep keyboard and screen-reader focus inside the panel across a request (WCAG 2.4.3). The panel's buttons stay
 * mounted and use aria-disabled while loading (a disabled button drops focus to <body>), and when the request
 * settles focus moves to what arrived: the answer (`result`) or the failure notice (`failure`). If the control the
 * student used went away while loading (the retry button inside a failure notice), the panel itself (`root`)
 * takes focus. Focus moves only when it was inside the panel (or lost to <body>), never away from elsewhere.
 */
export function useSettleFocus(phase: AiRequestState<unknown>["phase"]) {
  const root = React.useRef<HTMLDivElement>(null);
  const result = React.useRef<HTMLDivElement>(null);
  const failure = React.useRef<HTMLDivElement>(null);
  const previous = React.useRef(phase);

  React.useEffect(() => {
    const before = previous.current;
    previous.current = phase;
    if (before === phase) return;
    const active = typeof document === "undefined" ? null : document.activeElement;
    const ours = !active || active === document.body || Boolean(root.current?.contains(active));
    if (!ours) return;
    if (phase === "loading") {
      if (!active || active === document.body) root.current?.focus();
      return;
    }
    if (before !== "loading") return;
    const target = phase === "ok" ? result.current : phase === "failed" ? failure.current : null;
    (target ?? root.current)?.focus();
  }, [phase]);

  return { rootRef: root, resultRef: result, failureRef: failure };
}

/** Classes for a container that takes focus programmatically (tabIndex -1): the global focus ring, no tab stop. */
export const FOCUS_TARGET = "rounded-lg outline-offset-4";
