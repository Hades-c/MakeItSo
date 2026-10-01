import { render, screen, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiGateInput } from "@/lib/types/ai";
import type { SessionUser } from "@/server/auth/session";
import { getCareer } from "@/server/content/careers";

/**
 * The server part of the career page's AI panels (W9a-ai): what reaches the browser for each student, and the
 * page's wiring (the panels stream in their own Suspense boundary after the alumni).
 */

const state = vi.hoisted(() => ({
  user: null as SessionUser | null,
  gate: { enabled: true, configured: true, verified: true, consented: true } as AiGateInput,
  gateError: null as Error | null,
  mail: true,
}));

vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSessionUser: async () => state.user,
}));
vi.mock("@/server/auth/mailer", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isMailAvailable: () => state.mail,
}));
vi.mock("@/server/ai/gate", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  aiGateInput: async () => {
    if (state.gateError) throw state.gateError;
    return state.gate;
  },
}));
vi.mock("@/app/(hub)/careers/_lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadCareerTerms: async () => ({ current: "202601", registration: "202602", next: "202701" }),
}));

const { CareerAiPanels } = await import("@/app/(hub)/careers/[slug]/_components/ai-panels");

const MEDICINE = getCareer("medicine")!;
const VERIFIED: SessionUser = {
  id: "65f0c0ffee0000000000aaaa",
  email: "sam@davidson.edu",
  name: "Sam Studentname",
  emailVerifiedAt: "2026-09-01T12:00:00.000Z",
};

async function renderPanels(slug = "medicine") {
  const element = await CareerAiPanels({ career: getCareer(slug)! });
  const view = render(<SWRConfig value={{ provider: () => new Map() }}>{element}</SWRConfig>);
  return { element, ...view };
}

beforeEach(() => {
  state.user = VERIFIED;
  state.gate = { enabled: true, configured: true, verified: true, consented: true };
  state.gateError = null;
  state.mail = true;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CareerAiPanels", () => {
  it("renders nothing signed out or while AI_ENABLED is off", async () => {
    state.user = null;
    expect(await CareerAiPanels({ career: MEDICINE })).toBeNull();
    state.user = VERIFIED;
    vi.stubEnv("AI_ENABLED", "false");
    expect(await CareerAiPanels({ career: MEDICINE })).toBeNull();
  });

  it("an open student: both panels; the e-mail picker lists the career's contactable alumni only", async () => {
    await renderPanels();
    expect(screen.getByRole("heading", { name: /Your AI career plan/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Draft my career plan" })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Email an alumnus/ })).toBeVisible();
    const group = screen.getByRole("group", { name: "Who would you like to write to?" });
    const names = within(group)
      .getAllByRole("radio")
      .map((radio) => radio.closest("label")!.textContent);
    expect(names.some((n) => n?.includes("Rahael Borchers"))).toBe(true);
    // Notable alumni (contactable=false) are never offered.
    expect(names.some((n) => n?.includes("Sallie Permar"))).toBe(false);
    expect(names.some((n) => n?.includes("Thomas Marshburn"))).toBe(false);
  });

  it("the Alumni section off: the career plan only", async () => {
    vi.stubEnv("FEATURE_ALUMNI", "false");
    await renderPanels();
    expect(screen.getByRole("heading", { name: /Your AI career plan/ })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /Email an alumnus/ })).toBeNull();
  });

  it("an unverified @davidson.edu account: one notice with Verify, and no alumni in the page", async () => {
    state.user = { ...VERIFIED, emailVerifiedAt: null };
    state.gate = { enabled: true, configured: true, verified: false, consented: false };
    const { container } = await renderPanels();
    const notice = screen.getByTestId("ai-shared-gate");
    expect(notice).toHaveTextContent("limited to verified @davidson.edu accounts");
    expect(within(notice).getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      "/verify?reason=davidson&next=%2Fcareers%2Fmedicine",
    );
    expect(container.textContent).not.toContain("Rahael Borchers");
    expect(screen.queryByRole("button", { name: "Draft my career plan" })).toBeNull();
  });

  it("consent missing: one notice that leads to the profile's AI settings", async () => {
    state.gate = { enabled: true, configured: true, verified: true, consented: false };
    await renderPanels();
    expect(
      within(screen.getByTestId("ai-shared-gate")).getByRole("link", { name: "Open AI settings" }),
    ).toHaveAttribute("href", "/profile#ai-features");
  });

  it("not configured: says so once, with no button", async () => {
    state.gate = { enabled: true, configured: false, verified: false, consented: false };
    await renderPanels();
    expect(screen.getByTestId("ai-shared-gate")).toHaveTextContent(
      "AI features are not set up on this server yet.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a gate that cannot be read leaves the panels out (the page stays up)", async () => {
    state.gateError = new Error("db down");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await CareerAiPanels({ career: MEDICINE })).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it("a career without contactable alumni says so in the e-mail panel", async () => {
    await renderPanels("marketing");
    expect(screen.getByTestId("ai-email-none")).toBeVisible();
  });
});

describe("/careers/[slug] wiring", () => {
  it("renders the AI panels after the alumni, in their own boundary", async () => {
    vi.resetModules();
    vi.doMock("next/server", async (importOriginal) => ({
      ...(await importOriginal<object>()),
      connection: async () => undefined,
    }));
    vi.doMock("@/app/(hub)/careers/[slug]/_components/ai-panels", () => ({
      CareerAiPanels: ({ career }: { career: { slug: string } }) => (
        <div data-testid="ai-slot">{career.slug}</div>
      ),
    }));
    vi.doMock("@/app/(hub)/careers/_components/career-courses", () => ({
      CareerCourses: () => <div data-testid="courses-slot" />,
    }));
    vi.doMock("@/app/(hub)/careers/_components/career-programs", () => ({
      CareerPrograms: () => <div data-testid="programs-slot" />,
    }));
    vi.doMock("@/app/(hub)/careers/_components/career-alumni", () => ({
      CareerAlumni: () => <div data-testid="alumni-slot" />,
    }));
    const page = await import("@/app/(hub)/careers/[slug]/page");
    render(await page.default({ params: Promise.resolve({ slug: "medicine" }) }));
    const ai = screen.getByTestId("ai-slot");
    expect(ai).toHaveTextContent("medicine");
    const alumni = screen.getByTestId("alumni-slot");
    expect(alumni.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
