import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app/app-shell";
import { BottomTabs } from "@/components/app/bottom-tabs";
import type { NavKey } from "@/components/app/nav-items";
import { SidebarNav } from "@/components/app/sidebar-nav";
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
    // The current page carries the --nav-mark bar (the >= 3:1 cue; the pill's tint alone is about 1.1:1).
    expect(within(main).getByRole("link", { name: /Courses/ })).toHaveClass("before:bg-nav-mark");
    expect(within(main).getByRole("link", { name: "Today" }).className).not.toMatch(/nav-mark/);
    expect(main).not.toHaveTextContent("676");

    rerender(<SidebarNav counts={{ plan: { done: 12, total: 32 } }} />);
    // Only My plan has a count; its name says it in words, in one string.
    expect(within(main).getByRole("link", { name: /^Courses$/ })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: "My plan, 12 of 32 credits" })).toHaveTextContent(
      "12/32",
    );
  });
});

describe("nested sections", () => {
  it("lists Syllabi under My plan and Alumni under Careers, indented, always shown", () => {
    nav.pathname = "/today";
    render(<SidebarNav />);
    const main = screen.getByRole("navigation", { name: "Main" });
    const top = within(main)
      .getAllByRole("listitem")
      .filter((li) => li.parentElement!.parentElement === main);
    expect(top.map((li) => li.querySelector("a")!.textContent)).toEqual([
      "Today",
      "Courses",
      "My plan",
      "Careers",
      "Events",
    ]);
    const childrenOf = (label: string) =>
      [
        ...top
          .find((li) => li.querySelector("a")!.textContent === label)!
          .querySelectorAll(":scope ul a"),
      ].map((a) => a.textContent);
    expect(childrenOf("My plan")).toEqual(["Syllabi"]);
    expect(childrenOf("Careers")).toEqual(["Alumni"]);
    for (const label of ["Today", "Courses", "Events"]) expect(childrenOf(label)).toEqual([]);
    for (const name of ["Syllabi", "Alumni"]) {
      expect(within(main).getByRole("link", { name })).toHaveClass("xl:pl-7.5");
    }
  });

  it.each([
    ["/syllabi", "Syllabi", /^My plan/],
    ["/alumni", "Alumni", /^Careers/],
  ])(
    "on %s marks the child current and its parent with the bar, aria-current on the child only",
    (path, child, parent) => {
      nav.pathname = path;
      render(<SidebarNav />);
      const main = screen.getByRole("navigation", { name: "Main" });
      const childLink = within(main).getByRole("link", { name: child });
      const parentLink = within(main).getByRole("link", { name: parent });
      expect(childLink).toHaveAttribute("aria-current", "page");
      expect(childLink).toHaveClass("before:bg-nav-mark", "text-primary");
      expect(parentLink).not.toHaveAttribute("aria-current");
      expect(parentLink).toHaveClass("before:bg-nav-mark");
      // Red is the current page only: the parent is red only on the rail, where the child is hidden.
      expect(parentLink).not.toHaveClass("text-primary");
      expect(parentLink).toHaveClass("max-xl:text-primary");
      expect(main.querySelectorAll("[aria-current]")).toHaveLength(1);
    },
  );
});

describe("the 720-1179px rail", () => {
  it("shows exactly the five parents, every label on screen (13px under the icon), never only in a tooltip", () => {
    nav.pathname = "/today";
    render(<SidebarNav />);
    const main = screen.getByRole("navigation", { name: "Main" });
    // The nested lists are hidden below 1180px (the rail has no room to show nesting).
    for (const list of main.querySelectorAll("ul ul")) expect(list).toHaveClass("max-xl:hidden");
    const links = [...main.querySelectorAll<HTMLAnchorElement>(":scope > ul > li > a")];
    expect(links.map((l) => l.textContent)).toEqual([
      "Today",
      "Courses",
      "My plan",
      "Careers",
      "Events",
    ]);
    for (const link of within(main).getAllByRole("link")) expect(link).not.toHaveAttribute("title");
    for (const link of links) {
      // The rail item: 56px tall, icon over label, like the bottom tabs.
      expect(link).toHaveClass("max-xl:h-14", "max-xl:flex-col");
      const label = link.querySelector("span")!;
      expect(label.className).not.toMatch(/sr-only/);
      expect(label).toHaveClass("max-xl:text-nav");
    }
  });
});

describe("BottomTabs", () => {
  it("highlights My plan on /syllabi (it has no tab)", () => {
    nav.pathname = "/syllabi";
    render(<BottomTabs />);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("bottom-tabs").querySelectorAll("[aria-current]")).toHaveLength(1);
  });

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
    // The current tab's 28 x 3px bar in --nav-mark; the others have none.
    expect(screen.getByRole("link", { name: "Careers" })).toHaveClass("before:bg-nav-mark");
    expect(screen.getByRole("link", { name: "Today" }).className).not.toMatch(/nav-mark/);
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

  it("leave the sidebar, which keeps its order (a parent keeps whichever children are left)", () => {
    nav.pathname = "/today";
    const { rerender } = render(<SidebarNav nav={[...CORE, "syllabi", "careers", "alumni"]} />);
    expect(sidebarLabels()).toEqual([
      "Today",
      "Courses",
      "My plan",
      "Syllabi",
      "Careers",
      "Alumni",
    ]);
    rerender(<SidebarNav nav={[...CORE, "careers", "events"]} />);
    expect(sidebarLabels()).toEqual(["Today", "Courses", "My plan", "Careers", "Events"]);
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

describe("LazyUserMenu", () => {
  it("is a plain avatar button until pressed, then the open account menu", async () => {
    const { LazyUserMenu } = await import("@/components/app/lazy-user-menu");
    const user = userEvent.setup();
    render(<LazyUserMenu name="Casey Wildcat" email="casey@davidson.edu" />);
    const placeholder = screen.getByRole("button", { name: "Account menu for Casey Wildcat" });
    expect(placeholder).toHaveTextContent("CW");
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(placeholder);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Sign out/ })).toBeInTheDocument();
    expect(screen.getByTestId("hub-user-email")).toHaveTextContent("casey@davidson.edu");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Account menu for Casey Wildcat" })).toHaveFocus();
  });
});
