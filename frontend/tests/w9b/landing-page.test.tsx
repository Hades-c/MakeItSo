import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(marketing)/page";
import type * as AccountActions from "@/app/(marketing)/_components/account-actions";
import { LandingFactsView } from "@/app/(marketing)/_components/landing-facts";

/**
 * The landing page: the same truthful page for signed-out visitors, Go to Today for signed-in students, and only
 * the sections a visitor could use right now (feature flags, mail and AI configuration).
 */

const state = vi.hoisted(() => ({ signedIn: false }));
// connection() needs a request scope; the page only awaits it to stay out of the build.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));
// The session-dependent buttons and the live facts are async server components (tested on their own); here
// stand-ins render the same views.
vi.mock("@/app/(marketing)/_components/account-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof AccountActions>();
  return {
    ...actual,
    HeaderActions: () => <actual.HeaderActionsView signedIn={state.signedIn} />,
    HeroActions: () => <actual.HeroActionsView signedIn={state.signedIn} />,
  };
});
vi.mock("@/app/(marketing)/_components/landing-facts", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LandingFacts: () => <p data-testid="facts-slot">facts</p>,
}));

const ALL_OFF = {
  FEATURE_CAREERS: "false",
  FEATURE_EVENTS: "false",
  FEATURE_ALUMNI: "false",
  AI_ENABLED: "false",
  RMP_ENABLED: "false",
};

function stubEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

beforeEach(() => {
  state.signedIn = false;
  // Every section usable: flags at their defaults (on), mail through the console mailer, the mock AI provider.
  stubEnv({ MAIL_PROVIDER: "console", AI_PROVIDER: "mock" });
});

async function renderHome() {
  render(await HomePage());
  return document.body.textContent ?? "";
}

/** The links and buttons drawn as Davidson Red fills (the Button primary variant). */
function redFills(): string[] {
  return [...document.querySelectorAll("a, button")]
    .filter((el) => el.classList.contains("bg-primary-fill"))
    .map((el) => el.textContent?.trim() ?? "");
}

function featureTitles(): string[] {
  const features = screen.getByRole("region", { name: "One place instead of many tabs" });
  return within(features)
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent ?? "");
}

describe("/ for visitors", () => {
  it("offers sign-up and sign-in, with the live facts slot", async () => {
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
    // Hidden below 360px (the hero's CTA covers it), so the header fits a 320px screen.
    expect(within(account).getByRole("link", { name: "Create account" })).toHaveClass(
      "max-[22.5rem]:hidden",
    );
    expect(screen.getByRole("link", { name: /Create your account/ })).toHaveAttribute(
      "href",
      "/register",
    );
    // One red action: the hero's. The header's Create account does the same thing, outlined.
    expect(redFills()).toEqual(["Create your account"]);
    expect(screen.queryByRole("link", { name: /Go to Today/ })).toBeNull();
    expect(screen.getByTestId("facts-slot")).toBeInTheDocument();
    // Truthful copy only.
    expect(document.body.textContent).not.toMatch(/Gemini|Powered by/i);
    expect(document.body).toHaveTextContent("not an official Davidson College service");
  });

  it("describes every section while all of them can be used", async () => {
    const text = await renderHome();
    expect(featureTitles()).toEqual(["Courses", "My plan", "Careers", "Campus"]);
    expect(text).toContain(
      "See the real courses, campus programs and verified alumni connected to a career path.",
    );
    expect(text).toContain(
      "MakeItSo brings the Registrar’s public course schedule, a four-year plan, career paths and campus events together.",
    );
    expect(text).toContain(
      "Events and deadlines from across campus in one list, so fewer things slip through.",
    );
    expect(screen.getByTestId("landing-ai")).toHaveTextContent(
      "AI-assisted suggestions are grounded in the real course catalog",
    );
  });

  it("says nothing about flagged sections while every flag is off", async () => {
    stubEnv(ALL_OFF);
    const text = await renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your courses and your plan, in one place.",
    );
    expect(text).toContain(
      "MakeItSo brings the Registrar’s public course schedule and a four-year plan together.",
    );
    // "in one place" once, in the h1.
    expect(text.match(/in one place/g)).toHaveLength(1);
    expect(featureTitles()).toEqual(["Courses", "My plan"]);
    for (const claim of [
      "career path",
      "verified alumni",
      "campus events",
      "Events and deadlines from across campus",
      "Professor ratings",
      "ratings",
      "Suggestions for your plan",
      "AI-assisted suggestions",
    ]) {
      expect(text, claim).not.toContain(claim);
    }
    expect(screen.getByTestId("landing-ai")).toHaveTextContent("AI features are coming.");
    expect(screen.queryByText(/AI · verify with your advisor/)).toBeNull();
  });

  it("drops the alumni promise while the alumni directory is off", async () => {
    stubEnv({ FEATURE_ALUMNI: "false" });
    const text = await renderHome();
    expect(featureTitles()).toContain("Careers");
    expect(text).toContain("See the real courses and campus programs connected to a career path.");
    expect(text).not.toContain("verified alumni");
  });

  it("drops alumni and AI while no mail provider can verify an account", async () => {
    stubEnv({ MAIL_PROVIDER: "none" });
    const text = await renderHome();
    expect(text).not.toContain("verified alumni");
    expect(text).not.toContain("Suggestions for your plan");
    expect(screen.getByTestId("landing-ai")).toHaveTextContent("AI features are coming.");
    // The sections themselves are still there.
    expect(featureTitles()).toEqual(["Courses", "My plan", "Careers", "Campus"]);
  });

  it("drops the AI row while no AI provider is configured", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const text = await renderHome();
    expect(text).not.toContain("Suggestions for your plan");
    expect(text).not.toContain("AI-assisted suggestions");
  });

  it("drops the events card, row and words while Events is off", async () => {
    stubEnv({ FEATURE_EVENTS: "false" });
    const text = await renderHome();
    expect(featureTitles()).toEqual(["Courses", "My plan", "Careers"]);
    expect(text).not.toContain("Events and deadlines from across campus");
  });

  it("gives the home link a phone-sized tap target", async () => {
    await renderHome();
    expect(screen.getByRole("link", { name: "MakeItSo home" })).toHaveClass("min-h-11");
  });
});

describe("/ for signed-in students", () => {
  it("offers Go to Today instead of the sign-in buttons", async () => {
    state.signedIn = true;
    await renderHome();
    const account = screen.getByRole("navigation", { name: "Account" });
    expect(within(account).getByRole("link", { name: "Go to Today" })).toHaveAttribute(
      "href",
      "/today",
    );
    expect(within(account).queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Go to Today/ })).toHaveLength(2);
    expect(redFills()).toEqual(["Go to Today"]);
    expect(screen.queryByRole("link", { name: /Create your account/ })).toBeNull();
  });
});

describe("LandingFactsView", () => {
  it("shows each computed number with its words", () => {
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
      "1,366courses on the Spring 2027 schedule",
      "24career paths, each with real Davidson courses",
    ]);
  });

  it("renders nothing without facts", () => {
    const { container } = render(<LandingFactsView facts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
