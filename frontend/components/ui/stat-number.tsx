import type * as React from "react";
import { cn } from "@/lib/utils";

export interface StatNumberProps {
  value: React.ReactNode;
  /** Words after the number, e.g. "of 32 courses". */
  label: React.ReactNode;
  size?: "md" | "lg";
  className?: string;
}

/** Big number + label ("12 of 32 courses"). Numbers use tabular figures. Compute values; never hardcode them. */
export function StatNumber({ value, label, size = "lg", className }: StatNumberProps) {
  return (
    <p className={cn("flex items-baseline gap-2", className)}>
      <span
        className={cn("font-strong text-fg tabular-nums", size === "lg" ? "text-3xl" : "text-xl")}
      >
        {value}
      </span>{" "}
      <span className="text-sm text-fg-2">{label}</span>
    </p>
  );
}
