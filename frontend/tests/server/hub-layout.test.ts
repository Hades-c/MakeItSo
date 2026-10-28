import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HubLayout from "@/app/(hub)/layout";
import { VerifyBanner } from "@/app/(auth)/_components/verify-banner";
import { AppShell, type AppShellProps } from "@/components/app/app-shell";
import { SourceStatusNotice } from "@/components/app/source-status-notice";
import type { SourceStatus } from "@/server/sync";
import { MissingFixtureError } from "@/server/http/fixtures";

const stubs = vi.hoisted(() => ({
  getSourceStatuses: vi.fn(async (): Promise<SourceStatus[]> => []),
  verifyBannerFor: vi.fn(async (): Promise<unknown> => null),
  getPlanCredits: vi.fn(async () => ({ done: 12, planned: 16, required: 32 as const })),
  onboardedAt: undefined as string | null | undefined,
  returnPath: "/courses" as string | null,
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
vi.mock("@/server/sync", () => ({ getSourceStatuses: stubs.getSourceStatuses }));
vi.mock("@/server/auth/banner", () => ({ verifyBannerFor: stubs.verifyBannerFor }));

afterEach(() => {
  stubs.getSourceStatuses.mockReset().mockResolvedValue([]);
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
      "syllabi",
    ]);
  });

  it("leaves out the sections whose flags are off (Alumni with Careers)", async () => {
    vi.stubEnv("FEATURE_EVENTS", "false");
    expect((await shellProps()).nav).toEqual([
      "today",
      "courses",
      "plan",
      "careers",
      "alumni",
      "syllabi",
    ]);
    vi.stubEnv("FEATURE_CAREERS", "false");
    expect((await shellProps()).nav).toEqual(["today", "courses", "plan", "syllabi"]);
    vi.stubEnv("FEATURE_CAREERS", "true");
    vi.stubEnv("FEATURE_ALUMNI", "off");
    expect((await shellProps()).nav).toEqual(["today", "courses", "plan", "careers", "syllabi"]);
  });

  it("survives a malformed flag: logs it and uses its default", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FEATURE_EVENTS", "sometimes");
    vi.stubEnv("FEATURE_ALUMNI", "false");
    expect((await shellProps()).nav).toEqual([
      "today",
      "courses",
      "plan",
      "careers",
      "events",
      "syllabi",
    ]);
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
    expect((await shellProps()).counts).toEqual({});
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/plan credits/), expect.any(Error));
  });

  it("gives Courses no count (it read as that many courses in the plan)", async () => {
    expect((await shellProps()).counts).toEqual({ plan: { done: 12, total: 32 } });
  });

  it("never hides a missing test fixture", async () => {
    stubs.getPlanCredits.mockRejectedValue(
      new MissingFixtureError("course-schedule", "GET", "https://api.davidson.edu/x"),
    );
    await expect(HubLayout({ children: null })).rejects.toBeInstanceOf(MissingFixtureError);
  });
});

describe("hub layout: the source notice", () => {
  const row = (over: Partial<SourceStatus>): SourceStatus => ({
    id: "wildcatsync",
    label: "WildcatSync",
    lastSync: new Date("2026-09-29T16:00:00Z"),
    lastAttemptAt: new Date("2026-09-30T15:00:00Z"),
    status: "ok",
    count: 10,
    error: null,
    ...over,
  });

  it("renders nothing while every source is current", async () => {
    stubs.getSourceStatuses.mockResolvedValue([row({}), row({ id: "course-schedule" })]);
    expect(childrenOf(await shellProps())).toHaveLength(1);
  });

  it("names each source the pages show that is stale or failing, once, above the page", async () => {
    stubs.getSourceStatuses.mockResolvedValue([
      row({ status: "stale" }),
      row({ id: "ratemyprofessors", label: "RateMyProfessors", status: "error", lastSync: null }),
      row({ id: "course-schedule", label: "Course schedule" }),
      // A news-only feed: synced, but no page shows it.
      row({ id: "davidsonian", label: "The Davidsonian", status: "error" }),
    ]);
    const [notice, page] = childrenOf(await shellProps()) as ReactElement<{
      problems: unknown[];
    }>[];
    expect(notice?.type).toBe(SourceStatusNotice);
    expect(notice?.props.problems).toEqual([
      { label: "WildcatSync", status: "stale", lastSync: new Date("2026-09-29T16:00:00Z") },
      { label: "RateMyProfessors", status: "error", lastSync: null },
    ]);
    expect(page).toBeDefined();
  });

  it("leaves out the feeds of a flagged-off Events, and never fails the shell", async () => {
    vi.stubEnv("FEATURE_EVENTS", "false");
    stubs.getSourceStatuses.mockResolvedValue([row({ status: "stale" })]);
    expect(childrenOf(await shellProps())).toHaveLength(1);
    vi.unstubAllEnvs();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    stubs.getSourceStatuses.mockRejectedValue(new Error("db down"));
    expect(childrenOf(await shellProps())).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/source statuses/), expect.any(Error));
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
    // Plus what verifying opens, which the temporary AI_ALLOW_UNVERIFIED switch changes (off by default).
    expect(banner?.props).toEqual({ ...state, aiWithoutVerifying: false });
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
