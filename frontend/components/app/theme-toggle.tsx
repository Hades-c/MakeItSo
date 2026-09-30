"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./use-theme";

/**
 * Light/dark toggle. The icon is chosen by CSS (dark: variant), so it is right on first paint; the pressed state
 * follows the hook once hydrated.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  return (
    <button
      type="button"
      aria-label="Dark mode"
      aria-pressed={resolved === "dark"}
      onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}
      className={cn(
        "grid size-11 place-items-center rounded-md border border-line bg-surface text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg md:size-9.5",
        className,
      )}
    >
      <Moon aria-hidden strokeWidth={1.8} className="size-4.5 dark:hidden" />
      <Sun aria-hidden strokeWidth={1.8} className="hidden size-4.5 dark:block" />
    </button>
  );
}
