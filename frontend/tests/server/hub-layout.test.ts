import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HubLayout from "@/app/(hub)/layout";
import { VerifyBanner } from "@/app/(auth)/_components/verify-banner";
import { AppShell, type AppShellProps } from "@/components/app/app-shell";
import { SOURCES } from "@/lib/sources";
import { MissingFixtureError } from "@/server/http/fixtures";

const stubs = vi.hoisted(() => ({
  browseTerm: vi.fn(async () => "202602"),
  countCourses: vi.fn(async () => 612),
  verifyBannerFor: vi.fn(async (): Promise<unknown> => null),
  getPlanCredits: vi.fn(async () => ({ done: 12, planned: 16, required: 32 as const })),
  onboardedAt: undefined as string | null | undefined,
  returnPath: "/courses" as string | null,
  statuses: [] as { id: string; lastSync: string; status: string }[],
}));

vi.mock("@/server/auth/session", () => ({
  requireUser: async () => ({
    id: "0123456789abcdef01234567",
    email: "sam@davidson.edu",
    name: "Sam",
    ...(stubs.onboardedAt === undefined ? {} : { onboardedAt: stubs.onboardedAt }),
  }),
  isOnboarded: (user: { onboardedAt?: string | null }) => user.onboardedAt !== null,
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(stubs.returnPath === null ? {} : { "x-mis-return-path": stubs.returnPath }),
}));
vi.mock("@/server/plan", () => ({ getPlanCredits: stubs.getPlanCredits }));
vi.mock("@/server/sync", () => ({ getSourceStatuses: async () => stubs.statuses }));
vi.mock("@/server/catalog", () => ({
  browseTerm: stubs.browseTerm,
  countCourses: stubs.countCourses,
}));
vi.mock("@/server/auth/banner", () => ({ verifyBannerFor: stubs.verifyBannerFor }));

afterEach(() => {
  stubs.browseTerm.mockReset().mockResolvedValue("202602");
  stubs.countCourses.mockReset().mockResolvedValue(612);
  stubs.verifyBannerFor.mockReset().mockResolvedValue(null);
  stubs.getPlanCredits.mockReset().mockResolvedValue({ done: 12, planned: 16, required: 32 });
  stubs.onboardedAt = undefined;
  stubs.returnPath = "/courses";
});

/** The path a Next.js redirect() inside `run` goes to, or null when it renders. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    return digest.split(";")[2] ?? null;
  }
}

async function shell(): Promise<ReactElement<AppShellProps>> {
  const element: unknown = await HubLayout({ children: createElement("p", null, "page") });
  expect(isValidElement(element)).toBe(true);
  const shell = element as ReactElement<AppShellProps>;
  expect(shell.type).toBe(AppShell);
  return shell;
}

async function shellProps(): Promise<AppShellProps> {
  return (await shell()).props;
}

function childrenOf(props: AppShellProps): ReactNode[] {
  return Children.toArray(props.children);
}

describe("hub layout: flagged sections", () => {
  it("shows every section with the default flags", async () => {
    expect((await shellProps()).nav).toEqual([
      "today",
      "courses",
      "plan",
      "careers",
      "events",
      "alumni",
    ]);
  });

  it("leaves out the sections whose flags are off (Alumni with Careers)", async () => {
    vi.stubEnv("FEATURE_EVENTS", "false");
    expect((await shellProps()).nav).toEqual(["today", "courses", "plan", "careers", "alumni"]);
    vi.stubEnv("FEATURE_CAREERS", "false");
    expect((await shellProps()).nav).toEqual(["today", "courses", "plan"]);
    vi.stubEnv("FEATURE_CAREERS", "true");
    vi.stubEnv("FEATURE_ALUMNI", "off");
    expect((await shellProps()).nav).toEqual(["today", "courses", "plan", "careers"]);
  });

  it("survives a malformed flag: logs it and uses its default", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FEATURE_EVENTS", "sometimes");
    vi.stubEnv("FEATURE_ALUMNI", "false");
    expect((await shellProps()).nav).toEqual(["today", "courses", "plan", "careers", "events"]);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/FEATURE_EVENTS/));
  });
});

describe("hub layout: first run", () => {
  const layout = () => HubLayout({ children: null });

  it("sends an account that has not finished onboarding there, keeping the page it asked for", async () => {
    stubs.onboardedAt = null;
    stubs.returnPath = "/plan?tab=four-year";
    expect(await redirectOf(layout)).toBe("/onboarding?next=%2Fplan%3Ftab%3Dfour-year");
    stubs.returnPath = "/courses/202602/CSC-221";
    expect(await redirectOf(layout)).toBe("/onboarding?next=%2Fcourses%2F202602%2FCSC-221");
  });

  it("keeps Today and Profile open before onboarding (Today's nudge is for these accounts)", async () => {
    stubs.onboardedAt = null;
    for (const path of ["/today", "/today?day=2026-10-01", "/profile"]) {
      stubs.returnPath = path;
      expect([path, await redirectOf(layout)]).toEqual([path, null]);
    }
  });

  it("never redirects onboarded accounts, accounts without the field, or an unknown or unsafe path", async () => {
    stubs.onboardedAt = "2026-09-30T16:00:00.000Z";
    expect(await redirectOf(layout)).toBeNull();
    stubs.onboardedAt = undefined;
    expect(await redirectOf(layout)).toBeNull();
    stubs.onboardedAt = null;
    stubs.returnPath = null;
    expect(await redirectOf(layout)).toBeNull();
    stubs.returnPath = "//evil.example/x";
    expect(await redirectOf(layout)).toBeNull();
  });
});

describe("hub layout: sidebar counts", () => {
  it("counts the plan's credits out of 32", async () => {
    expect((await shellProps()).counts?.plan).toEqual({ done: 12, total: 32 });
    expect(stubs.getPlanCredits).toHaveBeenCalledWith("0123456789abcdef01234567");
  });

  it("shows no plan count when the plan cannot be read, and never fails the shell", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    stubs.getPlanCredits.mockRejectedValue(new Error("db down"));
    expect((await shellProps()).counts).toEqual({ courses: 612 });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/plan credits/), expect.any(Error));
  });

  it("counts the courses of the term browsing defaults to", async () => {
    expect((await shellProps()).counts).toEqual({ courses: 612, plan: { done: 12, total: 32 } });
    expect(stubs.browseTerm).toHaveBeenCalledWith({ now: expect.any(Date) });
    expect(stubs.countCourses).toHaveBeenCalledWith("202602");
  });

  it("shows no count when the catalog cannot answer, and never fails the shell", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    stubs.countCourses.mockRejectedValue(new Error("Schedule data is temporarily unavailable."));
    const plan = { done: 12, total: 32 };
    expect((await shellProps()).counts).toEqual({ plan });
    stubs.browseTerm.mockRejectedValue(new Error("db down"));
    expect((await shellProps()).counts).toEqual({ plan });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/course count/), expect.any(Error));
  });

  it("never hides a missing test fixture", async () => {
    stubs.countCourses.mockRejectedValue(
      new MissingFixtureError("course-schedule", "GET", "https://api.davidson.edu/x"),
    );
    await expect(HubLayout({ children: null })).rejects.toBeInstanceOf(MissingFixtureError);
  });
});

describe("hub layout: verify banner", () => {
  it("renders the banner above the page for an unverified Davidson account", async () => {
    const state = { email: "sam@davidson.edu", replaceable: true, hoursLeft: 5 };
    stubs.verifyBannerFor.mockResolvedValue(state);
    const children = childrenOf(await shellProps());
    expect(children).toHaveLength(2);
    const [banner] = children as ReactElement[];
    expect(banner?.type).toBe(VerifyBanner);
    expect(banner?.props).toEqual(state);
    expect(stubs.verifyBannerFor).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sam@davidson.edu" }),
      expect.any(Date),
    );
  });

  it("renders only the page when there is no banner or it cannot be computed", async () => {
    expect(childrenOf(await shellProps())).toHaveLength(1);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    stubs.verifyBannerFor.mockRejectedValue(new Error("db down"));
    expect(childrenOf(await shellProps())).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/verify banner/), expect.any(Error));
  });
});

describe("hub layout: Sources panel", () => {
  it("leaves out the news-only feeds, which no page shows yet", async () => {
    const at = "2026-09-30T18:40:00.000Z";
    stubs.statuses = ["course-schedule", "wildcatsync", "davidsonian", "davidson-news"].map(
      (id) => ({
        id,
        lastSync: at,
        status: "ok",
      }),
    );
    try {
      const { sources } = await shellProps();
      const synced = (sources ?? []).filter((source) => !("verifiedAt" in source));
      expect(synced.map((source) => source.id)).toEqual(["course-schedule", "wildcatsync"]);
    } finally {
      stubs.statuses = [];
    }
  });

  it("lists the curated sources with the date their content was verified", async () => {
    const { sources } = await shellProps();
    const curated = (sources ?? []).filter((source) => "verifiedAt" in source);
    expect(curated.map((source) => source.id)).toEqual([
      "registrar",
      "matthews-center",
      "hurt-hub-programs",
      "davidson-offices",
    ]);
    for (const source of curated) {
      expect("verifiedAt" in source && source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("links the link-only platforms at their curated links (Handshake, Davidson One, Athletics)", async () => {
    const { links } = await shellProps();
    expect(links).toEqual([
      { id: "handshake", href: "https://davidson.joinhandshake.com/" },
      { id: "davidson-one", href: SOURCES["davidson-one"].url },
      { id: "athletics", href: "https://davidsonwildcats.com/calendar" },
    ]);
  });
});
