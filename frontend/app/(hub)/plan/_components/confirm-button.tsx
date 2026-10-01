"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * A destructive button that asks first, in the page (no modal): the first press swaps the button for
 * "<question> [Yes, …] [Keep]" with focus on "Keep"; Escape or "Keep" puts the button back and returns focus to
 * it; only "Yes" runs the action, with focus back on the button (if it is still on the page) until the caller
 * moves it on. The question is announced (aria-live).
 */
export function ConfirmButton({
  question,
  confirmLabel,
  onConfirm,
  disabled,
  variant = "ghost",
  size = "sm",
  children,
}: {
  /** "Remove CSC 221 A from the list?" */
  question: string;
  /** "Yes, remove" */
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: "ghost" | "secondary";
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  const [asking, setAsking] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const keep = React.useRef<HTMLButtonElement>(null);
  const returnFocus = React.useRef(false);

  React.useEffect(() => {
    if (asking) keep.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [asking]);

  const cancel = () => {
    returnFocus.current = true;
    setAsking(false);
  };

  if (!asking) {
    return (
      <Button
        ref={trigger}
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {children}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={question}
      data-testid="confirm"
      className="flex flex-wrap items-center gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <span aria-live="polite" className="text-sm font-semibold text-fg">
        {question}
      </span>
      <Button
        type="button"
        variant="danger"
        size={size}
        disabled={disabled}
        onClick={() => {
          // Back on the button while the action runs; the caller moves focus on when the item leaves.
          returnFocus.current = true;
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button ref={keep} type="button" variant="secondary" size={size} onClick={cancel}>
        Keep
      </Button>
    </div>
  );
}
