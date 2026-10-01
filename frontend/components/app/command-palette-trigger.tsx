"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { openCommandPalette } from "./command-palette-store";

/**
 * Phone top-bar search: a link to the course catalog that opens the palette instead once JavaScript runs, so it
 * still works before hydration or without JavaScript (and a modified click still opens the catalog).
 */
export function CommandPaletteTrigger({ className }: { className?: string }) {
  return (
    <Link
      href="/courses"
      prefetch={false}
      aria-label="Search"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
          return;
        event.preventDefault();
        openCommandPalette("", event.currentTarget);
      }}
      className={cn(
        "grid size-11 place-items-center rounded-md border border-line bg-surface text-fg-2 hover:bg-surface-2",
        className,
      )}
    >
      <Search aria-hidden strokeWidth={1.8} className="size-4.5" />
    </Link>
  );
}
