import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiChipProps {
  className?: string;
  /** Text after "AI ·". */
  label?: string;
}

/** Marks AI-generated content: "AI · verify with your advisor". Every AI output renders one (PLAN §7). */
export function AiChip({ className, label = "verify with your advisor" }: AiChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-surface-2 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-fg-2",
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3 text-taupe" />
      <span aria-hidden>AI · {label}</span>
      <span className="sr-only">AI-generated content: {label}</span>
    </span>
  );
}
