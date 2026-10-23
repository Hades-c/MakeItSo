import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PLAN_TABS } from "@/app/(hub)/plan/_lib/tabs";
import { preloadPlanView, SummerEditor } from "@/app/(hub)/plan/_components/lazy-islands";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

describe("/plan's on-demand islands", () => {
  it("render the island once its module has loaded", async () => {
    render(<SummerEditor activities={[]} summerTerms={[]} defaultTerm={null} />);
    expect(await screen.findByRole("heading", { name: "No summer plans yet" })).toBeInTheDocument();
  });

  it("preloading any view never throws (Next semester has nothing to load)", () => {
    for (const tab of PLAN_TABS) expect(() => preloadPlanView(tab)).not.toThrow();
  });
});
