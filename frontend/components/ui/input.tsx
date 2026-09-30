import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared look for text-like controls (Input, Textarea, Select trigger). */
export const controlClass = [
  "w-full min-w-0 rounded-md border border-control bg-surface text-base text-fg md:text-sm",
  "placeholder:text-fg-3 transition-colors",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger",
].join(" ");

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type ?? "text"}
      className={cn(
        controlClass,
        "h-11 px-3 md:h-10",
        "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-fg",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
