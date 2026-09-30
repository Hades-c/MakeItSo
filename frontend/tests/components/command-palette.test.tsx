import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, CommandPaletteTrigger } from "@/components/app/command-palette";
import { closeCommandPalette, openCommandPalette } from "@/components/app/command-palette-store";
import {
  courseSearchHref,
  fetchSearch,
  isInternalHref,
  parseSearchResponse,
  SearchUnavailableError,
  searchResponseSchema,
  type SearchFn,
  type SearchResult,
} from "@/components/app/search-client";
import { SearchForm } from "@/components/app/search-form";
import { TooltipProvider } from "@/components/ui/tooltip";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/today" }));

const RESULTS: SearchResult[] = [
  {
    kind: "event",
    id: "e1",
    title: "Civil rights film screening",
    subtitle: "Thu, Oct 1",
    href: "/events",
    source: "wildcatsync",
  },
  {
    kind: "course",
    id: "c1",
    title: "HIS 357 · The Civil Rights Movement",
    subtitle: "Fall 2026",
    href: "/courses/202601/HIS-357",
    source: "course-schedule",
  },
  { kind: "career", id: "k1", title: "Law and public policy", href: "/careers/law" },
];

function renderPalette(search: SearchFn) {
  return render(
    <TooltipProvider>
      <CommandPalette search={search} debounceMs={0} />
    </TooltipProvider>,
  );
}

afterEach(() => {
  act(() => closeCommandPalette());
  router.push.mockReset();
});

describe("search client", () => {
  it("builds the catalog fallback", () => {
    expect(courseSearchHref("organic chemistry")).toBe("/courses?q=organic+chemistry");
    expect(courseSearchHref("  CSC 121 ")).toBe("/courses?q=CSC+121");
    expect(courseSearchHref("   ")).toBe("/courses");
  });

  it.each([
    ["/courses/202602/CSC-221", true],
    ["/careers/law?tab=alumni", true],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["https://evil.example", false],
    ["javascript:alert(1)", false],
    ["/a b", false],
    ["/a\u0000b", false],
    ["", false],
  ])("isInternalHref(%j) = %s", (href, ok) => {
    expect(isInternalHref(href)).toBe(ok);
  });

  it("keeps good rows, drops bad ones and unknown source tags", () => {
    const body = {
      results: [
        RESULTS[1],
        { kind: "course", id: "x", title: "Offsite", href: "https://evil.example" },
        { kind: "rumour", id: "y", title: "Nope", href: "/x" },
        { kind: "page", id: "p", title: "Today", href: "/today", source: "some-future-source" },
      ],
    };
    expect(parseSearchResponse(body)).toEqual([
      RESULTS[1],
      { kind: "page", id: "p", title: "Today", href: "/today" },
    ]);
    expect(parseSearchResponse({ nope: true })).toBeNull();
    expect(parseSearchResponse(null)).toBeNull();
    // The strict contract itself.
    expect(searchResponseSchema.safeParse({ results: RESULTS }).success).toBe(true);
    expect(
      searchResponseSchema.safeParse({ results: [{ ...RESULTS[0], kind: "rumour" }] }).success,
    ).toBe(false);
  });

  it("calls GET /api/search with q and limit, and parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: RESULTS }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const results = await fetchSearch("civil rights", new AbortController().signal);
    expect(results).toEqual(RESULTS);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/search?q=civil+rights&limit=20");
    vi.unstubAllGlobals();
  });

  it.each([
    ["a missing route", () => Promise.resolve(new Response("", { status: 404 }))],
    ["a stub", () => Promise.resolve(new Response("{}", { status: 501 }))],
    ["a server error", () => Promise.resolve(new Response("oops", { status: 500 }))],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["an HTML page", () => Promise.resolve(new Response("<html>", { status: 200 }))],
    ["the wrong shape", () => Promise.resolve(new Response('{"items":[]}', { status: 200 }))],
  ])("treats %s as unavailable", async (_name, impl) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(impl));
    await expect(fetchSearch("x y", new AbortController().signal)).rejects.toBeInstanceOf(
      SearchUnavailableError,
    );
    vi.unstubAllGlobals();
  });
});

describe("CommandPalette", () => {
  it("opens with ⌘K or Ctrl+K and lists the hub's pages before any typing", async () => {
    const user = userEvent.setup();
    renderPalette(vi.fn());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search MakeItSo" });
    const input = within(dialog).getByRole("combobox", { name: "Search MakeItSo" });
    expect(input).toHaveFocus();
    const pages = within(dialog).getByRole("group", { name: "Pages" });
    expect(
      within(pages)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Today", "Courses", "My plan", "Careers", "Events", "Alumni", "Profile"]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("groups results by kind with source tags, and navigates with the keyboard", async () => {
    const user = userEvent.setup();
    const search = vi.fn<SearchFn>().mockResolvedValue(RESULTS);
    renderPalette(search);
    act(() => openCommandPalette());
    const input = await screen.findByRole("combobox");
    await user.type(input, "civil rights");
    const listbox = screen.getByRole("listbox", { name: "Search results" });
    await within(listbox).findByRole("group", { name: "Courses" });
    expect(search).toHaveBeenLastCalledWith("civil rights", expect.any(AbortSignal));

    const groups = within(listbox).getAllByRole("group");
    expect(
      groups.map((g) => g.getAttribute("aria-labelledby") && g.firstChild?.textContent),
    ).toEqual(["Courses", "Careers", "Events"]);
    const options = within(listbox).getAllByRole("option");
    expect(options[0]).toHaveTextContent(
      "HIS 357 · The Civil Rights MovementFall 2026Source: Course schedule",
    );
    expect(options[0]!.querySelector("[data-source]")).toHaveAttribute(
      "data-source",
      "course-schedule",
    );
    expect(options[1]!.querySelector("[data-source]")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("3 results");

    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0]!.id);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(router.push).toHaveBeenCalledWith("/events");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("searches the catalog when Enter is pressed with nothing selected", async () => {
    const user = userEvent.setup();
    renderPalette(vi.fn<SearchFn>().mockResolvedValue(RESULTS));
    act(() => openCommandPalette());
    const input = await screen.findByRole("combobox");
    await user.type(input, "organic chemistry");
    await screen.findByRole("group", { name: "Courses" });
    await user.keyboard("{Enter}");
    expect(router.push).toHaveBeenCalledWith("/courses?q=organic+chemistry");
  });

  it("says search is unavailable and keeps the catalog fallback", async () => {
    const user = userEvent.setup();
    renderPalette(vi.fn<SearchFn>().mockRejectedValue(new SearchUnavailableError("404")));
    act(() => openCommandPalette("organic"));
    const input = await screen.findByRole("combobox");
    expect(input).toHaveValue("organic");
    expect(await screen.findByText("Search is unavailable right now.")).toBeInTheDocument();
    const fallback = screen.getByRole("link", { name: /Search courses for “organic”/ });
    expect(fallback).toHaveAttribute("href", "/courses?q=organic");
    await user.click(fallback);
    expect(router.push).toHaveBeenCalledWith("/courses?q=organic");
  });

  it("says when nothing matches, and matches pages locally", async () => {
    const user = userEvent.setup();
    renderPalette(vi.fn<SearchFn>().mockResolvedValue([]));
    act(() => openCommandPalette());
    const input = await screen.findByRole("combobox");
    await user.type(input, "zzz");
    expect(await screen.findByText("No matches for “zzz”.")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "plan");
    await waitFor(() =>
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["My plan"]),
    );
  });

  it("ignores stale responses when the query changes", async () => {
    const user = userEvent.setup();
    let resolveFirst: (r: SearchResult[]) => void = () => {};
    const search = vi
      .fn<SearchFn>()
      .mockImplementationOnce(
        (_q, signal) =>
          new Promise((resolve, reject) => {
            resolveFirst = resolve;
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      )
      .mockResolvedValue([RESULTS[2]!]);
    renderPalette(search);
    act(() => openCommandPalette());
    const input = await screen.findByRole("combobox");
    await user.type(input, "la");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await user.type(input, "w");
    await screen.findByRole("group", { name: "Careers" });
    act(() => resolveFirst(RESULTS));
    expect(screen.queryByRole("group", { name: "Courses" })).not.toBeInTheDocument();
  });

  it("opens from the phone trigger and from the top-bar field with its text", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SearchForm />
        <CommandPaletteTrigger />
        <CommandPalette search={vi.fn<SearchFn>().mockResolvedValue([])} debounceMs={0} />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close search" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.type(screen.getByRole("searchbox", { name: "Search courses" }), "econ");
    await user.click(screen.getByRole("button", { name: "Search everything" }));
    expect(await screen.findByRole("combobox")).toHaveValue("econ");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // The shortcut from inside the field carries its text over too.
    screen.getByRole("searchbox", { name: "Search courses" }).focus();
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox")).toHaveValue("econ");
  });

  it("keeps the top-bar form a plain GET to the catalog", () => {
    render(<SearchForm />);
    const form = screen.getByRole("search", { name: "Courses" });
    expect(form).toHaveAttribute("action", "/courses");
    expect(within(form).getByRole("searchbox", { name: "Search courses" })).toHaveAttribute(
      "name",
      "q",
    );
  });
});
