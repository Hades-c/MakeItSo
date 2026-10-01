"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { openCommandPalette, useCommandPaletteState } from "./command-palette-store";
import type { NavKey } from "./nav-items";

/**
 * The palette (Radix Dialog, the search client) loads the first time it is opened, in its own chunk, so it is not
 * part of every hub page's first-load JavaScript (PLAN §6.2 perf budget). Until then this owns the ⌘K / Ctrl+K
 * shortcut; the store (command-palette-store.ts) already holds "open" and the opener, so the palette opens with
 * focus handling intact as soon as it has loaded.
 */
const CommandPalette = dynamic(
  () => import("./command-palette").then((mod) => mod.CommandPalette),
  {
    ssr: false,
  },
);

export function LazyCommandPalette({ nav }: { nav?: readonly NavKey[] }) {
  const { open } = useCommandPaletteState();
  const [loaded, setLoaded] = React.useState(false);
  // Latched in render: once opened, the palette stays mounted (it then owns the shortcut itself).
  if (open && !loaded) setLoaded(true);

  React.useEffect(() => {
    if (loaded) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const focused = document.activeElement;
        openCommandPalette(
          focused instanceof HTMLInputElement && focused.id === "global-search"
            ? focused.value
            : "",
        );
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loaded]);

  return loaded ? <CommandPalette nav={nav} /> : null;
}
