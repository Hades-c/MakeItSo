"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 18px box with an invisible 44px hit area (::before), so it is easy to tap next to a label.
 * Label it with <label htmlFor> or aria-label.
 */
const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative inline-grid size-4.5 shrink-0 place-items-center rounded-xs border-[1.5px] border-line-strong bg-surface transition-colors",
      "before:absolute before:-inset-3.25 before:content-['']",
      "data-[state=checked]:border-primary-fill data-[state=checked]:bg-primary-fill data-[state=checked]:text-on-primary",
      "data-[state=indeterminate]:border-primary-fill data-[state=indeterminate]:bg-primary-fill data-[state=indeterminate]:text-on-primary",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="grid place-items-center">
      {props.checked === "indeterminate" ? (
        <Minus aria-hidden className="size-3.5" strokeWidth={3} />
      ) : (
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
