import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** /plan page routing: the tab (and the print view) come from the URL; only the current view's data loads. */

const loaders = vi.hoisted(() => ({
  loadNextSemester: vi.fn(),
  loadFourYear: vi.fn(),
  loadSuggestions: vi.fn(),
  loadSummer: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/auth/session", () => ({
  requireUser: vi.fn(async () => ({
    id: "650000000000000000000001",
    name: "Sam",
    email: "s@davidson.edu",
  })),
}));
vi.mock("@/server/clock", () => ({ now: () => new Date("2026-09-30T16:00:00Z") }));
vi.mock("@/server/env", () => ({ readEnv: () => "America/New_York" }));
vi.mock("@/app/(hub)/plan/_lib/load", () => loaders);

const { default: PlanPage } = await import("@/app/(hub)/plan/page");

const FAIL = { ok: false, message: "Down for a moment." };

beforeEach(() => {
  for (const load of Object.values(loaders)) load.mockReset().mockResolvedValue(FAIL);
});

async function renderPage(params: Record<string, string>) {
  render(await PlanPage({ searchParams: Promise.resolve(params) }));
}

describe("/plan", () => {
  it("defaults to Next semester for the registration term", async () => {
    await renderPage({});
    expect(screen.getByRole("heading", { level: 1, name: "My plan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next semester" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(loaders.loadNextSemester).toHaveBeenCalledWith("650000000000000000000001", null);
    expect(loaders.loadFourYear).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-tab-next")).toHaveTextContent("Down for a moment.");
  });

  it.each([
    ["four-year", "loadFourYear", "Your plan could not load"],
    ["suggestions", "loadSuggestions", "Suggestions could not load"],
    ["summer", "loadSummer", "Summer plans could not load"],
  ] as const)("?tab=%s loads only its view", async (tab, loader, title) => {
    await renderPage({ tab });
    expect(loaders[loader]).toHaveBeenCalledTimes(1);
    expect(loaders.loadNextSemester).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: tab === "four-year" ? "4-year plan" : tab === "summer" ? "Summer" : "Suggestions",
      }),
    ).toBeInTheDocument();
  });

  it("passes a later term through and opens the print view", async () => {
    await renderPage({ tab: "next", term: "202701", view: "print" });
    expect(loaders.loadNextSemester).toHaveBeenCalledWith("650000000000000000000001", "202701");
    expect(
      screen.getByRole("heading", { name: "Your WebTree list could not load" }),
    ).toBeInTheDocument();
  });

  it("an unknown tab falls back to Next semester", async () => {
    await renderPage({ tab: "grades" });
    expect(loaders.loadNextSemester).toHaveBeenCalled();
  });
});
