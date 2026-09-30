"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Form from "next/form";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const noop = () => () => {};
const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * Global search: a GET form to /courses?q=… (works without JavaScript; next/form makes it a client navigation).
 * ⌘K / Ctrl+K focuses it.
 */
export function SearchForm({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const apple = useSyncExternalStore(noop, isApple, () => true);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        aria-keyshortcuts="Meta+K Control+K"
        className="h-10 w-full rounded-md border border-line-strong bg-bg pr-14 pl-10 text-sm text-fg placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-xs border border-line-2 bg-surface px-1.5 font-mono text-xs text-fg-3"
      >
        {apple ? "⌘K" : "Ctrl K"}
      </kbd>
    </Form>
  );
}
