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

function listedSources(): (string | null)[] {
  const list = screen.getByRole("list", { name: "Sources MakeItSo draws on" });
  return [...list.querySelectorAll("[data-source]")].map((el) => el.getAttribute("data-source"));
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

  it("describes every section while all of them can be used", async () => {
    const text = await renderHome();
    expect(featureTitles()).toEqual(["Courses", "My plan", "Careers", "Campus"]);
    expect(text).toContain(
      "See the real courses, campus programs and verified alumni connected to a career path.",
    );
    expect(text).toContain(
      "MakeItSo brings the course schedule, a four-year plan, career paths and campus events together",
    );
    expect(text).toContain("Club and campus events");
    expect(text).toContain("Professor ratings, with the date they were checked");
    expect(text).toContain("Suggestions for your plan");
    expect(text).toContain("Deadlines, ratings and events keep a tag naming their source");
    expect(screen.getByTestId("landing-ai")).toHaveTextContent(
      "AI-assisted suggestions are grounded in the real course catalog",
    );
    expect(listedSources()).toEqual([
      "course-schedule",
      "registrar",
      "ratemyprofessors",
      "wildcatsync",
      "hurt-hub",
      "library",
      "events-digest",
    ]);
  });

  it("says nothing about flagged sections while every flag is off", async () => {
    stubEnv(ALL_OFF);
    const text = await renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your courses and your plan, in one place.",
    );
    expect(text).toContain(
      "MakeItSo brings the course schedule and a four-year plan together, and labels every item",
    );
    expect(featureTitles()).toEqual(["Courses", "My plan"]);
    for (const claim of [
      "career path",
      "verified alumni",
      "campus events",
      "Club and campus events",
      "Events and deadlines from across campus",
      "Professor ratings",
      "ratings",
      "Suggestions for your plan",
      "AI-assisted suggestions",
    ]) {
      expect(text, claim).not.toContain(claim);
    }
    expect(text).toContain("Deadlines keep a tag naming their source");
    expect(screen.getByTestId("landing-ai")).toHaveTextContent("AI features are coming.");
    expect(screen.queryByText(/AI · verify with your advisor/)).toBeNull();
    expect(listedSources()).toEqual(["course-schedule", "registrar"]);
    // No Davidsonian: no page shows its items.
    expect(document.querySelector("[data-source=davidsonian]")).toBeNull();
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

  it("drops the events card, row, words and feed sources while Events is off", async () => {
    stubEnv({ FEATURE_EVENTS: "false" });
    const text = await renderHome();
    expect(featureTitles()).toEqual(["Courses", "My plan", "Careers"]);
    expect(text).not.toContain("Club and campus events");
    expect(text).toContain("Deadlines and ratings keep a tag naming their source");
    expect(listedSources()).toEqual(["course-schedule", "registrar", "ratemyprofessors"]);
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
    expect(screen.queryByRole("link", { name: /Create your account/ })).toBeNull();
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
