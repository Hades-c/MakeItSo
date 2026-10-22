"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Optimistic saving for a value the student changes in quick taps (interest chips): the UI shows the new value at
 * once, and saves go out one at a time, always with the latest value, so answers can never arrive out of order and
 * leave an older value on the server. When a save fails, the value goes back to the last one the server confirmed
 * and `error` says why.
 *
 *   const interests = useSerialSave(initial, saveInterests, sameList);
 *   interests.set([...interests.value, slug]);
 *
 * `save` and `equal` are read on the first render only: pass functions that do not depend on component state.
 */

export type SerialSaveStatus = "idle" | "saving" | "saved" | "error";

export interface SerialSave<T> {
  value: T;
  set: (next: T) => void;
  status: SerialSaveStatus;
  error: unknown;
}

export function useSerialSave<T>(
  initial: T,
  save: (value: T) => Promise<T>,
  equal: (a: T, b: T) => boolean,
): SerialSave<T> {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<SerialSaveStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const confirmed = useRef(initial);
  const desired = useRef(initial);
  const running = useRef(false);
  const saveRef = useRef(save);
  const equalRef = useRef(equal);

  const flush = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus("saving");
    try {
      while (!equalRef.current(desired.current, confirmed.current)) {
        const sending = desired.current;
        try {
          confirmed.current = await saveRef.current(sending);
        } catch (caught) {
          desired.current = confirmed.current;
          setValue(confirmed.current);
          setError(caught);
          setStatus("error");
          return;
        }
      }
      // Show what the server stored (it may normalise, e.g. drop a duplicate).
      desired.current = confirmed.current;
      setValue(confirmed.current);
      setError(null);
      setStatus("saved");
    } finally {
      running.current = false;
    }
  }, []);

  const set = useCallback(
    (next: T) => {
      desired.current = next;
      setValue(next);
      void flush();
    },
    [flush],
  );

  return { value, set, status, error };
}
