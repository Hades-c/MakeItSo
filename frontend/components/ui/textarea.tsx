import * as React from "react";
import { cn } from "@/lib/utils";
import { controlClass } from "./input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows ?? 4}
      className={cn(controlClass, "min-h-24 px-3 py-2.5 leading-relaxed", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
