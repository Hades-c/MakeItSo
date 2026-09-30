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
}));

vi.mock("@/server/auth/session", () => ({
  requireUser: async () => ({
    id: "0123456789abcdef01234567",
    email: "sam@davidson.edu",
    name: "Sam",
  }),
}));
vi.mock("@/server/sync", () => ({ getSourceStatuses: async () => [] }));
vi.mock("@/server/catalog", () => ({
  browseTerm: stubs.browseTerm,
  countCourses: stubs.countCourses,
}));
vi.mock("@/server/auth/banner", () => ({ verifyBannerFor: stubs.verifyBannerFor }));

afterEach(() => {
  stubs.browseTerm.mockReset().mockResolvedValue("202602");
  stubs.countCourses.mockReset().mockResolvedValue(612);
  stubs.verifyBannerFor.mockReset().mockResolvedValue(null);
});

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

describe("hub layout: sidebar count", () => {
  it("counts the courses of the term browsing defaults to", async () => {
    expect((await shellProps()).counts).toEqual({ courses: 612 });
    expect(stubs.browseTerm).toHaveBeenCalledWith({ now: expect.any(Date) });
    expect(stubs.countCourses).toHaveBeenCalledWith("202602");
  });

  it("shows no count when the catalog cannot answer, and never fails the shell", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    stubs.countCourses.mockRejectedValue(new Error("Schedule data is temporarily unavailable."));
    expect((await shellProps()).counts).toEqual({});
    stubs.browseTerm.mockRejectedValue(new Error("db down"));
    expect((await shellProps()).counts).toEqual({});
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
