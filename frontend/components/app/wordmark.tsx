import { cn } from "@/lib/utils";

/** The square "M" mark in Lake Blue with the striped foot, as in the Lakeside mockups. Decorative. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-primary-fill text-on-primary",
        className,
      )}
    >
      <span className="relative -top-0.75 text-base leading-none font-bold">M</span>
      <span className="absolute inset-x-0 bottom-0 h-2.25 brand-stripes opacity-70" />
    </span>
  );
}

/**
 * "MakeItSo / Davidson College" lock-up. The subline shows from 720px up by default (the Lakeside phone top bar
 * drops it); pass subline="always" to keep it.
 */
export function Wordmark({
  subline = "desktop",
  className,
}: {
  subline?: "always" | "desktop";
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex flex-col leading-tight">
        <span className="text-lg leading-5 font-strong tracking-title text-fg">MakeItSo</span>
        <span
          className={cn("text-xs font-medium text-fg-3", subline === "desktop" && "max-md:sr-only")}
        >
          Davidson College
        </span>
      </span>
    </span>
  );
}
