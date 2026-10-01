import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Chip: a static pill for requirement codes, tags and facts ("VPRQ", "LTRQ · now"); `wrap` lets long text wrap.
 * ToggleChip: a pressable filter pill (aria-pressed), 44px tall on touch layouts.
 */
const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        outline: "border-line text-fg-2",
        neutral: "border-transparent bg-surface-2 text-fg-2",
        active: "border-transparent bg-primary-wash text-primary",
        done: "border-transparent bg-success-wash text-success",
      },
      mono: {
        true: "font-mono",
        false: "",
      },
      /** Long text (a section title in a search row) wraps inside the chip instead of overflowing a phone. */
      wrap: {
        true: "max-w-full min-w-0 [overflow-wrap:anywhere] whitespace-normal",
        false: "",
      },
    },
    defaultVariants: {
      variant: "outline",
      mono: false,
      wrap: false,
    },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chipVariants> {}

function Chip({ className, variant, mono, wrap, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ variant, mono, wrap }), className)} {...props} />;
}

export interface ToggleChipProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed"
> {
  pressed: boolean;
}

const ToggleChip = React.forwardRef<HTMLButtonElement, ToggleChipProps>(
  ({ className, pressed, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-medium whitespace-nowrap text-fg-2 transition-colors md:h-8.5 md:px-3",
        "hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-50",
        "aria-pressed:border-primary aria-pressed:bg-primary-wash aria-pressed:text-primary",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  ),
);
ToggleChip.displayName = "ToggleChip";

export { Chip, ToggleChip, chipVariants };
