"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A destructive button that asks first, in the page (no modal). Mirrors
 * app/(hub)/plan/_components/confirm-button.tsx.
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
  question: string;
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
          returnFocus.current = true;
          setAsking(false);
          onConfirm();
        }}
      >
        <Trash2 aria-hidden />
        {confirmLabel}
      </Button>
      <Button ref={keep} type="button" variant="secondary" size={size} onClick={cancel}>
        Keep
      </Button>
    </div>
  );
}
