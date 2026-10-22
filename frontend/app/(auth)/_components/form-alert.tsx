import type * as React from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FormAlertProps {
  /** danger: role="alert" (announced at once); info/success: role="status". */
  tone?: "danger" | "info" | "success";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

const TONES = {
  danger: { role: "alert", icon: TriangleAlert, box: "border-danger bg-danger-wash text-danger" },
  info: { role: "status", icon: Info, box: "border-line bg-primary-wash text-fg" },
  success: { role: "status", icon: CircleCheck, box: "border-line bg-success-wash text-fg" },
} as const;

/** The auth forms' message box: icon + text, never colour alone. */
export function FormAlert({ tone = "danger", title, children, className }: FormAlertProps) {
  const { role, icon: Icon, box } = TONES[tone];
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-sm font-medium",
        box,
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "info" && "text-primary",
          tone === "success" && "text-success",
        )}
      />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5 font-normal" : "")}>{children}</div> : null}
      </div>
    </div>
  );
}
