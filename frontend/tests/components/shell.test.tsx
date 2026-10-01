import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app/app-shell";
import { BottomTabs } from "@/components/app/bottom-tabs";
import type { NavKey } from "@/components/app/nav-items";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SourcesPanel } from "@/components/app/sources-panel";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { initials } from "@/components/app/user-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const nav = vi.hoisted(() => ({ pathname: "/today" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

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

describe("flagged-off sections", () => {
  const CORE: NavKey[] = ["today", "courses", "plan"];
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const sidebarLabels = () =>
    within(screen.getByRole("navigation", { name: "Main" }))
      .getAllByRole("link")
      .map((l) => l.textContent);
  const tabLabels = () =>
    within(screen.getByTestId("bottom-tabs"))
      .getAllByRole("link")
      .map((l) => l.textContent);

  it("leave the sidebar, which keeps its order", () => {
    nav.pathname = "/today";
    const { rerender } = render(<SidebarNav nav={[...CORE, "careers", "alumni"]} />);
    expect(sidebarLabels()).toEqual(["Today", "Courses", "My plan", "Careers", "Alumni"]);
    rerender(<SidebarNav nav={[...CORE, "events"]} />);
    expect(sidebarLabels()).toEqual(["Today", "Courses", "My plan", "Events"]);
    rerender(<SidebarNav nav={CORE} />);
    expect(sidebarLabels()).toEqual(["Today", "Courses", "My plan"]);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  it("highlight nothing in the sidebar on a hidden section's (404) page", () => {
    nav.pathname = "/alumni";
    render(<SidebarNav nav={[...CORE, "careers", "events"]} />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).queryByRole("link", { name: "Alumni" })).not.toBeInTheDocument();
    expect(main.querySelector("[aria-current]")).toBeNull();
  });

  it("leave four phone tabs without Events, in order, in equal columns", () => {
    nav.pathname = "/plan";
    render(<BottomTabs nav={[...CORE, "careers", "alumni"]} />);
    expect(tabLabels()).toEqual(["Today", "Courses", "Plan", "Careers"]);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    const list = within(screen.getByTestId("bottom-tabs")).getByRole("list");
    expect(list).toHaveClass("grid-flow-col", "auto-cols-fr");
    expect(list).not.toHaveClass("grid-cols-5");
  });

  it("leave three phone tabs without Careers and Events", () => {
    nav.pathname = "/today";
    render(<BottomTabs nav={CORE} />);
    expect(tabLabels()).toEqual(["Today", "Courses", "Plan"]);
  });

  it("keep /alumni on the Careers tab only while Careers is shown", () => {
    nav.pathname = "/alumni";
    const { rerender } = render(<BottomTabs nav={[...CORE, "careers", "events", "alumni"]} />);
    expect(screen.getByRole("link", { name: "Careers" })).toHaveAttribute("aria-current", "page");
    // Careers (and so Alumni) off: no Careers tab, and no other tab is marked current instead.
    rerender(<BottomTabs nav={[...CORE, "events"]} />);
    expect(tabLabels()).toEqual(["Today", "Courses", "Plan", "Events"]);
    expect(screen.getByTestId("bottom-tabs").querySelector("[aria-current]")).toBeNull();
    // Alumni off, Careers on: /alumni is a 404, so Careers is not current either.
    rerender(<BottomTabs nav={[...CORE, "careers", "events"]} />);
    expect(screen.getByTestId("bottom-tabs").querySelector("[aria-current]")).toBeNull();
  });

  it("reach every surface through the AppShell's nav prop", async () => {
    nav.pathname = "/today";
    // The theme toggle reads the system preference.
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <AppShell
          user={{ name: "Sam Student", email: "sam@davidson.edu" }}
          now={new Date("2026-09-30T16:00:00Z")}
          nav={[...CORE, "events"]}
        >
          <h1>Today</h1>
        </AppShell>
      </TooltipProvider>,
    );
    const [sidebar] = screen.getAllByRole("navigation", { name: "Main" });
    expect(
      within(sidebar!)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Today", "Courses", "My plan", "Events"]);
    expect(tabLabels()).toEqual(["Today", "Courses", "Plan", "Events"]);

    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search MakeItSo" });
    expect(
      within(within(dialog).getByRole("group", { name: "Pages" }))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Today", "Courses", "My plan", "Events", "Profile"]);
    await user.keyboard("{Escape}");
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

describe("UserMenu", () => {
  it("opens without aria-hiding the rest of the app (not modal: no aria-hidden-focus)", async () => {
    const { UserMenu } = await import("@/components/app/user-menu");
    const user = userEvent.setup();
    render(
      <div>
        <main>
          <a href="/today">Page link</a>
        </main>
        <UserMenu name="Casey Wildcat" email="casey@davidson.edu" />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "Account menu for Casey Wildcat" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(document.querySelector("[aria-hidden=true] a, [data-aria-hidden] a")).toBeNull();
    expect(screen.getByRole("main").closest("[aria-hidden]")).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
