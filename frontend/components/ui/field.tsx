import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export interface FieldProps {
  /** id of the control; the label, hint and error are wired to it. */
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  /** Exactly one control element (Input, Textarea, SelectTrigger, ...). */
  children: React.ReactElement;
}

/**
 * Label + control + hint + error, with ids, aria-describedby and aria-invalid wired automatically.
 *   <Field id="email" label="Email" hint="Use your @davidson.edu address"><Input type="email" /></Field>
 */
export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Slot id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
        {children}
      </Slot>
      {hint ? (
        <p id={hintId} className="text-xs text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/**
 * A field's error line: the danger colour with an icon and words, never colour alone (red is also the accent).
 * For controls wired by hand (fieldsets, checkbox groups), give it the id their aria-describedby names. Also the
 * small error line beside a button (role="status": announced politely, the page goes on).
 */
export function FieldError({
  id,
  role,
  className,
  children,
}: {
  id?: string;
  role?: "alert" | "status";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      role={role}
      className={cn("flex items-start gap-1 text-xs font-semibold text-danger", className)}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
