import { COURSE_COLOR_CLASSES, courseColor } from "@/lib/course-color";
import { cn } from "@/lib/utils";

export interface CourseCodeProps {
  /** Course code, e.g. "CSC 221". */
  code: string;
  /** Optional section letter, e.g. "A". */
  section?: string;
  /**
   * text: coloured mono text (lists, due items)
   * chip: coloured text on its wash (plan cells, pills)
   * tab:  solid colour tab (course index card)
   */
  variant?: "text" | "chip" | "tab";
  size?: "sm" | "md";
  className?: string;
}

const VARIANT = {
  text: "",
  chip: "rounded-sm px-1.5 py-0.5",
  tab: "rounded-t-md px-3 pt-1.5 pb-1.75 tracking-wide",
} as const;

/**
 * A course code in IBM Plex Mono, coloured by department (lib/course-color.ts). The code is always printed, so
 * colour is never the only cue.
 */
export function CourseCode({
  code,
  section,
  variant = "text",
  size = "sm",
  className,
}: CourseCodeProps) {
  const color = courseColor(code);
  const classes = COURSE_COLOR_CLASSES[color];
  return (
    <span
      data-course-color={color}
      className={cn(
        "inline-block font-mono font-semibold whitespace-nowrap",
        size === "sm" ? "text-xs" : "text-sm",
        variant === "text" && classes.text,
        variant === "chip" && classes.chip,
        variant === "tab" && classes.fill,
        VARIANT[variant],
        className,
      )}
    >
      {code}
      {section ? ` ${section}` : null}
    </span>
  );
}
