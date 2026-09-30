"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CornerDownLeft,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SourceTag } from "@/components/ui/source-tag";
import { cn } from "@/lib/utils";
import {
  closeCommandPalette,
  focusedElement,
  openCommandPalette,
  useCommandPaletteState,
} from "./command-palette-store";
import { NAV_ITEMS } from "./nav-items";
import {
  courseSearchHref,
  fetchSearch,
  SEARCH_RESULT_KINDS,
  type SearchFn,
  type SearchResult,
  type SearchResultKind,
} from "./search-client";

const GROUPS: Record<SearchResultKind, { label: string; icon: LucideIcon }> = {
  course: { label: "Courses", icon: BookOpen },
  career: { label: "Careers", icon: BriefcaseBusiness },
  event: { label: "Events", icon: CalendarDays },
  alumnus: { label: "Alumni", icon: Users },
  page: { label: "Pages", icon: ArrowRight },
};

/** Shortest query sent to the API. */
const MIN_QUERY = 2;

/** The hub's own pages, always available (they need no API). */
const PAGE_RESULTS: SearchResult[] = [
  ...NAV_ITEMS.map((item) => ({
    kind: "page" as const,
    id: `page-${item.key}`,
    title: item.label,
    href: item.href,
  })),
  { kind: "page", id: "page-profile", title: "Profile", href: "/profile" },
];

function matchingPages(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return PAGE_RESULTS;
  return PAGE_RESULTS.filter((p) => p.title.toLowerCase().includes(q));
}

type Status = "idle" | "loading" | "ready" | "unavailable";

const NO_RESULTS: SearchResult[] = [];

export interface CommandPaletteProps {
  /** Search implementation (default: GET /api/search). Tests and the design gallery pass their own. */
  search?: SearchFn;
  /** Controlled open state. Leave both unset for the app-wide palette (store + ⌘K shortcut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Initial text when controlled. */
  initialQuery?: string;
  /** Debounce before searching, in ms (default 200). */
  debounceMs?: number;
}

/**
 * ⌘K / Ctrl+K command palette: one search over courses, careers, events, alumni and pages, grouped by kind, each
 * result with its source tag. Arrow keys move, Enter opens the highlighted result, or, with nothing highlighted,
 * searches the course catalog (/courses?q=…); Escape closes. Radix Dialog traps focus; since the palette has no
 * Dialog.Trigger, it returns focus itself to whatever opened it (the ⌘K button, the phone search link, the top-bar
 * field). While the search API is missing or failing it says so and keeps the catalog fallback.
 */
export function CommandPalette({
  search = fetchSearch,
  open: controlledOpen,
  onOpenChange,
  initialQuery = "",
  debounceMs = 200,
}: CommandPaletteProps) {
  const controlled = controlledOpen !== undefined;
  const store = useCommandPaletteState();
  const open = controlled ? controlledOpen : store.open;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlled) onOpenChange?.(next);
      else if (next) openCommandPalette();
      else closeCommandPalette();
    },
    [controlled, onOpenChange],
  );

  // Where focus goes back to on close. The store records the app-wide palette's opener when it opens; a
  // controlled palette takes whatever had focus as it opened (this runs before Radix moves focus into it).
  const openerRef = React.useRef<HTMLElement | null>(null);
  const storeOpener = store.opener;
  React.useLayoutEffect(() => {
    if (open) openerRef.current = controlled ? focusedElement() : storeOpener;
  }, [open, controlled, storeOpener]);

  // The app-wide palette owns the keyboard shortcut.
  React.useEffect(() => {
    if (controlled) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        // Carry over what was already typed in the top-bar course search (focus returns there too).
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
  }, [controlled]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="lg"
        hideClose
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          openerRef.current = null;
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
        className="top-4 max-h-[calc(100dvh-2rem)] max-w-160 translate-y-0 overflow-hidden p-0 md:top-[12vh] md:max-h-[76vh] md:p-0"
      >
        <DialogTitle className="sr-only">Search MakeItSo</DialogTitle>
        <DialogDescription className="sr-only">
          Search courses, careers, events, alumni and pages. Use the arrow keys to move through
          results and Enter to open one; Enter with nothing selected searches the course catalog.
        </DialogDescription>
        <PaletteBody
          search={search}
          initialQuery={controlled ? initialQuery : store.query}
          debounceMs={debounceMs}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({
  search,
  initialQuery,
  debounceMs,
  onClose,
}: {
  search: SearchFn;
  initialQuery: string;
  debounceMs: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const id = React.useId();
  const listId = `${id}-results`;
  const [query, setQuery] = React.useState(initialQuery);
  const [response, setResponse] = React.useState<{
    query: string;
    status: "ready" | "unavailable";
    results: SearchResult[];
  } | null>(null);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const trimmed = query.trim();

  const status: Status =
    trimmed.length < MIN_QUERY ? "idle" : response?.query === trimmed ? response.status : "loading";

  React.useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      search(trimmed, controller.signal).then(
        (found) => {
          if (!controller.signal.aborted)
            setResponse({ query: trimmed, status: "ready", results: found });
        },
        () => {
          if (!controller.signal.aborted)
            setResponse({ query: trimmed, status: "unavailable", results: [] });
        },
      );
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, search, debounceMs]);

  // API results, plus the hub's pages when the API gave none of its own.
  const results = status === "ready" && response ? response.results : NO_RESULTS;
  const options = React.useMemo(() => {
    const pages = results.some((r) => r.kind === "page") ? [] : matchingPages(trimmed);
    const all = [...results, ...pages];
    return SEARCH_RESULT_KINDS.flatMap((kind) => all.filter((r) => r.kind === kind));
  }, [results, trimmed]);

  const keyOf = (r: SearchResult) => `${r.kind}:${r.id}`;
  const active = activeKey === null ? -1 : options.findIndex((o) => keyOf(o) === activeKey);
  const setActive = (index: number) => {
    const option = options[index];
    setActiveKey(option ? keyOf(option) : null);
  };

  const groups = SEARCH_RESULT_KINDS.map((kind) => ({
    kind,
    items: options
      .map((option, index) => ({ option, index }))
      .filter((o) => o.option.kind === kind),
  })).filter((g) => g.items.length > 0);

  const optionId = (index: number) => `${id}-option-${index}`;

  React.useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from the stable useId value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter or an arrow that confirms an IME candidate (Safari reports key "Enter" while composing) is the IME's.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(
        active < 0
          ? step === 1
            ? 0
            : options.length - 1
          : (active + step + options.length) % options.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = active >= 0 ? options[active] : undefined;
      if (chosen) go(chosen.href);
      else if (trimmed) go(courseSearchHref(trimmed));
    }
  }

  let message: string | null = null;
  if (status === "loading") message = "Searching…";
  else if (status === "unavailable") message = "Search is unavailable right now.";
  else if (status === "ready" && options.length === 0) message = `No matches for “${trimmed}”.`;
  // Only local page matches: say what the search itself found.
  else if (status === "ready" && results.length === 0)
    message = `No courses, careers, events or alumni match “${trimmed}”.`;

  const announcement =
    status === "loading"
      ? "Searching"
      : status === "unavailable"
        ? "Search is unavailable. Press Enter to search the course catalog."
        : status === "ready"
          ? `${options.length} ${options.length === 1 ? "result" : "results"}`
          : "";

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2.5 border-b border-line px-4 has-focus-visible:ring-2 has-focus-visible:ring-focus has-focus-visible:ring-inset">
        <Search aria-hidden strokeWidth={1.8} className="size-4.5 shrink-0 text-fg-3" />
        <input
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search MakeItSo"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search courses, careers, events…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveKey(null);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-[1rem] text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none md:text-base"
        />
        <button
          type="button"
          aria-label="Close search"
          onClick={onClose}
          className="-mr-2 grid min-h-11 shrink-0 place-items-center rounded-md px-2 text-sm font-semibold text-fg-2 hover:bg-surface-2 hover:text-fg md:min-h-8"
        >
          <span aria-hidden className="md:hidden">
            Close
          </span>
          <kbd
            aria-hidden
            className="hidden rounded-xs border border-line-2 bg-surface px-1.5 font-mono text-xs text-fg-3 md:inline"
          >
            Esc
          </kbd>
        </button>
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label="Search results"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        {groups.map((group) => {
          const { label, icon: Icon } = GROUPS[group.kind];
          const headingId = `${id}-group-${group.kind}`;
          return (
            <div key={group.kind} role="group" aria-labelledby={headingId} className="pb-1">
              <p
                id={headingId}
                className="px-2.5 pt-2 pb-1 font-mono text-xs font-medium tracking-label text-fg-3 uppercase"
              >
                {label}
              </p>
              {group.items.map(({ option, index }) => (
                <div
                  key={`${option.kind}-${option.id}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => go(option.href)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2",
                    index === active ? "bg-primary-wash" : "hover:bg-surface-2",
                  )}
                >
                  <Icon aria-hidden strokeWidth={1.8} className="size-4 shrink-0 text-fg-3" />
                  {/* Phones: the title gets the whole row and the source tag goes under it. */}
                  <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "text-sm font-semibold break-words md:truncate",
                          index === active ? "text-primary" : "text-fg",
                        )}
                      >
                        {option.title}
                      </span>
                      {option.subtitle ? (
                        <span className="text-xs break-words text-fg-2 md:truncate">
                          {option.subtitle}
                        </span>
                      ) : null}
                    </span>
                    {option.source ? (
                      <SourceTag
                        source={option.source}
                        className="mt-1 self-start md:mt-0 md:shrink-0 md:self-center"
                      />
                    ) : null}
                  </span>
                  {index === active ? (
                    <CornerDownLeft
                      aria-hidden
                      className="size-4 shrink-0 text-primary max-md:hidden"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
        <p className={cn("text-fg-2", status === "unavailable" && "font-semibold text-fg")}>
          {message ?? (trimmed ? "Press Enter to search the course catalog." : "Type to search.")}
        </p>
        {trimmed ? (
          <a
            href={courseSearchHref(trimmed)}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              go(courseSearchHref(trimmed));
            }}
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary hover:underline md:min-h-0"
          >
            Search courses for “{trimmed}”
            <ArrowRight aria-hidden className="size-4" />
          </a>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

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
