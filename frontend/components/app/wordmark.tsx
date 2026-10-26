import { cn } from "@/lib/utils";

/** The square "M" mark: a Playfair "M" on Davidson Red, as in the classic MakeItSo. Decorative. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md bg-primary-fill font-display text-lg leading-none font-bold text-on-primary",
        className,
      )}
    >
      M
    </span>
  );
}

/**
 * "MakeItSo / Davidson College" lock-up, the name in Playfair Display bold. The subline shows from 720px up by
 * default (the phone top bar drops it); pass subline="always" to keep it.
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
        <span className="font-display text-lg leading-5 font-bold text-fg">MakeItSo</span>
        <span
          className={cn("text-xs font-medium text-fg-3", subline === "desktop" && "max-md:sr-only")}
        >
          Davidson College
        </span>
      </span>
    </span>
  );
}
