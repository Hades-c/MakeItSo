"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/** On/off switch (role="switch"). Label it with <label htmlFor> or aria-label. */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex h-6 w-10.5 shrink-0 items-center rounded-full border border-transparent bg-control p-0.5 transition-colors",
      "before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
      "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary-fill",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-surface shadow-card transition-transform duration-150 data-[state=checked]:translate-x-4.5" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

export { Switch };
