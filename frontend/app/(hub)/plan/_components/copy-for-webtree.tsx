"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * "Copy for WebTree": the plan service's plain text (rank, CRN, course, section, title, alternates) to the
 * clipboard. MakeItSo never automates WebTree and never asks for Davidson credentials: the student types the
 * CRNs in themselves. When the browser refuses the clipboard (or has none), the text appears selected in a
 * read-only box to copy by hand; "Show the text" opens the same box any time.
 */
export function CopyForWebTree({
  text,
  disabled,
  disabledReason,
}: {
  text: string;
  disabled?: boolean;
  /** Why copying waits ("Saving your changes…"). */
  disabledReason?: string;
}) {
  const id = React.useId();
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const [shown, setShown] = React.useState(false);
  const box = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  React.useEffect(() => {
    if (state === "failed" && box.current) {
      box.current.focus();
      box.current.select();
    }
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
      setShown(true);
    }
  };

  const lines = text.split("\n").length;

  return (
    <div className="flex flex-col gap-2" data-testid="copy-for-webtree">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={disabled} onClick={() => void copy()}>
          {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {state === "copied" ? "Copied" : "Copy for WebTree"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={shown}
          aria-controls={`${id}-text`}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? "Hide the text" : "Show the text"}
        </Button>
        {disabled && disabledReason ? (
          <span className="text-xs text-fg-2">{disabledReason}</span>
        ) : null}
      </div>
      <p aria-live="polite" className="text-xs text-fg-2">
        {state === "copied"
          ? "Copied. Paste it next to WebTree and enter each CRN there yourself."
          : state === "failed"
            ? "Your browser didn’t allow copying. The text is selected below: copy it yourself (Ctrl+C or ⌘C)."
            : null}
      </p>
      <div id={`${id}-text`} hidden={!shown}>
        <Label htmlFor={`${id}-box`} className="sr-only">
          WebTree preferences as text
        </Label>
        <textarea
          ref={box}
          id={`${id}-box`}
          readOnly
          value={text}
          rows={Math.min(14, Math.max(3, lines))}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(controlClass, "px-3 py-2 font-mono leading-6 md:text-xs md:leading-5")}
        />
      </div>
    </div>
  );
}
