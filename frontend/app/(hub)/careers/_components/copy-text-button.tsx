"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Copy a short text (Handshake search words) to the clipboard. Says what happened in words, for everyone: "Copied"
 * on the button and in a polite live region, or how to copy by hand when the browser refuses.
 */
export function CopyTextButton({
  text,
  what,
}: {
  text: string;
  /** What is copied, for screen readers: "Copy" + " search words". */
  what: string;
}) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");

  React.useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => void copy()}>
        {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {state === "copied" ? "Copied" : "Copy"} <span className="sr-only">{what}</span>
      </Button>
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? `Copied “${text}”` : null}
      </span>
      {state === "failed" ? (
        <p className="basis-full text-xs text-fg-2">
          Your browser didn’t allow copying. Select the words and copy them yourself.
        </p>
      ) : null}
    </>
  );
}
