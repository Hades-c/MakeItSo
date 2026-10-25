import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button. Primary is the Davidson Red fill: the one main action on a screen. Secondary is outlined white with a
 * 3:1 edge. Danger (destructive actions only) is outlined in the crimson danger colour, never a red fill, so it can
 * never pass for the primary action: give it a trash icon and words, and ask first. Every size is at least 44px
 * tall below 720px (touch), and compact on desktop.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border whitespace-nowrap select-none",
    "font-semibold transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-primary-fill bg-primary-fill text-on-primary hover:border-primary-fill-hover hover:bg-primary-fill-hover",
        secondary: "border-line-strong bg-surface text-fg hover:bg-surface-2 [&_svg]:text-fg-2",
        ghost: "border-transparent bg-transparent text-fg-2 hover:bg-surface-2 hover:text-fg",
        danger: "border-danger bg-surface text-danger hover:bg-danger-wash",
      },
      size: {
        sm: "h-11 px-3 text-sm md:h-8",
        md: "h-11 px-3.5 text-sm md:h-9.5",
        lg: "h-12 px-5 text-base md:h-11",
        icon: "size-11 md:size-9.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the single child (e.g. a Next.js <Link>) with button styling instead of a <button>. */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(asChild ? {} : { type: type ?? "button" })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
