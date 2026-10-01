/**
 * Chip classes for free text from the schedule (requirement names, rooms, restrictions): Chip is nowrap by default
 * (components/ui/chip.tsx), which pushes a long label past a 360px screen. These let it wrap inside its line.
 */
export const WRAP_CHIP =
  "max-w-full min-w-0 items-start text-left whitespace-normal break-words [overflow-wrap:anywhere] [&_svg]:mt-0.5";

/** Long upstream text without spaces ("PuertoRico:Past,Present,Future", bare URLs) breaks anywhere. */
export const BREAK_TEXT = "break-words [overflow-wrap:anywhere]";
