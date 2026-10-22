"use client";

import { useRef, useSyncExternalStore } from "react";
import Form from "next/form";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { openCommandPalette } from "./command-palette-store";

const noop = () => () => {};
const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * Top-bar search: a GET form to /courses?q=… (works without JavaScript; next/form makes it a client navigation).
 * The ⌘K / Ctrl+K button beside it, and the shortcut itself, open the command palette (search across courses,
 * careers, events, alumni and pages), carrying over anything already typed.
 */
export function SearchForm({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const apple = useSyncExternalStore(noop, isApple, () => true);

  return (
    <Form
      action="/courses"
      role="search"
      aria-label="Courses"
      className={cn("relative", className)}
    >
      <label htmlFor="global-search" className="sr-only">
        Search courses
      </label>
      <Search
        aria-hidden
        strokeWidth={1.8}
        className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-fg-3"
      />
      <input
        ref={inputRef}
        id="global-search"
        name="q"
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Search courses"
        className="h-10 w-full rounded-md border border-line-strong bg-bg pr-16 pl-10 text-sm text-fg placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="button"
        aria-label="Search everything"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={(event) => openCommandPalette(inputRef.current?.value ?? "", event.currentTarget)}
        className="absolute top-1/2 right-1.5 grid h-7 -translate-y-1/2 place-items-center rounded-xs px-1.5 text-fg-3 hover:text-fg"
      >
        <kbd
          aria-hidden
          className="rounded-xs border border-line-2 bg-surface px-1.5 font-mono text-xs text-fg-3"
        >
          {apple ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </Form>
  );
}
