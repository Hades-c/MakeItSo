import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SourcesPanel } from "@/components/app/sources-panel";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { initials } from "@/components/app/user-menu";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const nav = vi.hoisted(() => ({ pathname: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

describe("SidebarNav", () => {
  it("marks the current section and shows counts only when given", () => {
    nav.pathname = "/courses/202602/CSC-221";
    const { rerender } = render(<SidebarNav />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: /Courses/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(main).getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
    expect(main).not.toHaveTextContent("676");

    rerender(<SidebarNav counts={{ courses: 676, plan: { done: 12, total: 32 } }} />);
    expect(within(main).getByRole("link", { name: /Courses/ })).toHaveTextContent(
      "Courses, 676 courses",
    );
    expect(within(main).getByRole("link", { name: /My plan/ })).toHaveTextContent(
      "My plan, 12/ of 32 credits",
    );
  });
});

describe("BottomTabs", () => {
  it("shows five tabs and highlights Careers on /alumni", () => {
    nav.pathname = "/alumni";
    render(<BottomTabs />);
    const links = within(screen.getByTestId("bottom-tabs")).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Today",
      "Courses",
      "Plan",
      "Careers",
      "Events",
    ]);
    expect(screen.getByRole("link", { name: "Careers" })).toHaveAttribute("aria-current", "page");
  });
});

describe("SourcesPanel", () => {
  const now = new Date("2026-09-30T18:00:00Z");

  it("lists each source with its last sync in Davidson time", () => {
    render(
      <SourcesPanel
        now={now}
        sources={[
          { id: "course-schedule", lastSync: "2026-09-30T10:00:00Z" },
          { id: "handshake", lastSync: "2026-09-29T13:05:00Z", status: "stale" },
          { id: "wildcatsync", lastSync: null },
        ]}
      />,
    );
    const items = within(screen.getByRole("region", { name: "Sources" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Course schedule, synced, 6:00a",
      "Handshake, out of date, Sep 29",
      "WildcatSync, not synced yet, never",
    ]);
  });

  it("survives invalid dates instead of crashing the shell", () => {
    render(
      <SourcesPanel
        now={now}
        sources={[
          { id: "course-schedule", lastSync: "not a date" },
          { id: "registrar", label: "Academic calendar", verifiedAt: "2026-13-45" },
        ]}
      />,
    );
    const items = within(screen.getByRole("region", { name: "Sources" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Course schedule, not synced yet, never",
      "Academic calendar",
    ]);
  });

  it("shows curated sources with their verified date and link-only platforms under Links", () => {
    render(
      <SourcesPanel
        now={now}
        sources={[
          { id: "registrar", label: "Academic calendar", verifiedAt: "2026-09-28T16:00:00Z" },
        ]}
        links={[{ id: "handshake", href: "https://app.joinhandshake.com/" }]}
      />,
    );
    const region = screen.getByRole("region", { name: "Sources" });
    expect(within(region).getAllByRole("listitem")[0]).toHaveTextContent(
      "Academic calendar, verified Sep 28",
    );
    const link = within(region).getByRole("link", { name: /Handshake/ });
    expect(link).toHaveAttribute("href", "https://app.joinhandshake.com/");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("(opens in a new tab)");
  });

  it("says when nothing has synced", () => {
    render(<SourcesPanel now={now} sources={[]} />);
    expect(screen.getByText("No sources synced yet.")).toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("switches to dark and back, remembering the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Dark mode" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(button).toHaveAttribute("aria-pressed", "true");

    await user.click(button);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

describe("initials", () => {
  it.each([
    ["Casey Wildcat", "c@davidson.edu", "CW"],
    ["Mary Ann de la Cruz", "m@davidson.edu", "MC"],
    ["Prince", "p@davidson.edu", "PR"],
    ["", "zoe@davidson.edu", "Z"],
  ])("%s → %s", (name, email, expected) => {
    expect(initials(name, email)).toBe(expected);
  });
});
