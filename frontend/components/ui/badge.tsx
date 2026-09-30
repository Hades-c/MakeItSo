import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Small status label. Colour carries meaning only through the semantic tokens; pair it with words (never colour
 * alone). "urgent" (Davidson Red) is for time-critical items only; errors use "danger".
 */
const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-fg-2",
        primary: "bg-primary-wash text-primary",
        success: "bg-success-wash text-success",
        warning: "bg-warning-wash text-warning",
        danger: "bg-danger-wash text-danger",
        urgent: "bg-urgent-wash text-urgent",
        outline: "border border-line text-fg-2",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
