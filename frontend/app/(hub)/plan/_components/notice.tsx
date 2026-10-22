import type * as React from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One inline message for the plan tabs: an error (danger wash + icon + words), a warning, a success or a neutral
 * note. Colour never carries the meaning alone. Renders nothing without children.
 */
export function Notice({
  tone,
  children,
  className,
  ...rest
}: {
  tone: "error" | "warning" | "success" | "info";
  children?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  if (children === null || children === undefined || children === false || children === "") {
    return null;
  }
  const Icon = tone === "success" ? CircleCheck : tone === "info" ? Info : TriangleAlert;
  return (
    <div
      {...rest}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
        tone === "error" && "bg-danger-wash text-danger",
        tone === "warning" && "bg-warning-wash text-fg",
        tone === "success" && "bg-success-wash text-success",
        tone === "info" && "bg-surface-2 text-fg-2",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-4 shrink-0", tone === "warning" && "text-warning")}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
