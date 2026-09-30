import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import HubLayout from "@/app/(hub)/layout";
import { AppShell, type AppShellProps } from "@/components/app/app-shell";

vi.mock("@/server/auth/session", () => ({
  requireUser: async () => ({
    id: "0123456789abcdef01234567",
    email: "sam@davidson.edu",
    name: "Sam",
  }),
}));
vi.mock("@/server/sync", () => ({ getSourceStatuses: async () => [] }));

async function shellProps(): Promise<AppShellProps> {
  const element: unknown = await HubLayout({ children: null });
  expect(isValidElement(element)).toBe(true);
  const shell = element as ReactElement<AppShellProps>;
  expect(shell.type).toBe(AppShell);
  return shell.props;
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
