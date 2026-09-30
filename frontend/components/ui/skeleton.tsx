import { cn } from "@/lib/utils";

/** Loading placeholder. Decorative: put a visually hidden "Loading…" status next to a group of them. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-skeleton rounded-md bg-surface-2", className)}
      {...props}
    />
  );
}
