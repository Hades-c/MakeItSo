import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(marketing)/page";
import { LandingFactsView } from "@/app/(marketing)/_components/landing-facts";

/** The landing page: the same truthful page for signed-out visitors, Go to Today for signed-in students. */

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
// The live facts are an async server component; here a stand-in marks where they render.
vi.mock("@/app/(marketing)/_components/landing-facts", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LandingFacts: () => <p data-testid="facts-slot">facts</p>,
}));

afterEach(() => {
  session.getSessionUser.mockReset();
});

async function renderHome() {
  render(await HomePage());
}

describe("/", () => {
  it("offers sign-up and sign-in to signed-out visitors, with the live facts slot", async () => {
    session.getSessionUser.mockResolvedValue(null);
    await renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your courses, your plan and your campus, in one place.",
    );
    const account = screen.getByRole("navigation", { name: "Account" });
    expect(within(account).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(within(account).getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getByRole("link", { name: /Create your account/ })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.queryByRole("link", { name: /Go to Today/ })).toBeNull();
    expect(screen.getByTestId("facts-slot")).toBeInTheDocument();
    // Truthful copy only.
    expect(document.body.textContent).not.toMatch(/Gemini|Powered by/i);
    expect(document.body).toHaveTextContent("not an official Davidson College service");
  });

  it("sends signed-in students to Today instead", async () => {
    session.getSessionUser.mockResolvedValue({
      id: "0123456789abcdef01234567",
      email: "casey@davidson.edu",
      name: "Casey",
    });
    await renderHome();
    const account = screen.getByRole("navigation", { name: "Account" });
    expect(within(account).getByRole("link", { name: "Go to Today" })).toHaveAttribute(
      "href",
      "/today",
    );
    expect(within(account).queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Go to Today/ })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Create your account/ })).toBeNull();
  });

  it("treats a session that cannot be read as signed out", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    session.getSessionUser.mockRejectedValue(new Error("NEXTAUTH_SECRET is not set"));
    await renderHome();
    expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBeGreaterThan(0);
    expect(log).toHaveBeenCalledWith("[landing] could not read the session:", expect.any(Error));
  });

  it("lets Next.js control flow through (dynamic rendering, redirects)", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/x;307;",
    });
    session.getSessionUser.mockRejectedValue(redirect);
    await expect(HomePage()).rejects.toBe(redirect);
  });
});

describe("LandingFactsView", () => {
  it("shows each computed number with its words and source", () => {
    render(
      <LandingFactsView
        facts={[
          {
            id: "courses",
            value: 1366,
            label: "courses on the Spring 2027 schedule",
            source: "course-schedule",
          },
          {
            id: "careers",
            value: 24,
            label: "career paths, each with real Davidson courses",
            source: null,
          },
        ]}
      />,
    );
    const facts = screen.getByRole("region", { name: "MakeItSo right now" });
    const items = within(facts).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "1,366courses on the Spring 2027 scheduleSource: Course schedule",
      "24career paths, each with real Davidson courses",
    ]);
    expect(items[0]!.querySelector("[data-source]")).toHaveAttribute(
      "data-source",
      "course-schedule",
    );
  });

  it("renders nothing without facts", () => {
    const { container } = render(<LandingFactsView facts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
