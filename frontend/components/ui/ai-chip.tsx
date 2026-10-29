import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiChipProps {
  className?: string;
  /** Text after "AI ·". */
  label?: string;
  /**
   * The smallest chip: only "AI" is shown (the label is still read out), for a row whose meta line already says
   * where the item came from ("From your syllabus AI").
   */
  compact?: boolean;
}

/** Marks AI-generated content: "AI · verify with your advisor". Every AI output renders one (PLAN §7). */
export function AiChip({
  className,
  label = "verify with your advisor",
  compact = false,
}: AiChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-dashed border-line-strong bg-surface-2 font-sans text-xs font-semibold whitespace-nowrap text-fg-2",
        compact ? "gap-1 px-1.5 leading-4" : "gap-1.5 px-2 py-0.5",
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3 text-taupe" />
      <span aria-hidden>{compact ? "AI" : `AI · ${label}`}</span>
      <span className="sr-only">AI-generated content: {label}</span>
    </span>
  );
}
