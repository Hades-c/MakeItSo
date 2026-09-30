import { afterEach, describe, expect, it, vi } from "vitest";
import * as alumniPage from "@/app/(hub)/alumni/page";
import * as careerPage from "@/app/(hub)/careers/[slug]/page";
import * as careersPage from "@/app/(hub)/careers/page";
import * as eventsPage from "@/app/(hub)/events/page";
import { metadata as hubNotFoundMetadata } from "@/app/(hub)/not-found";
import { getFlags } from "@/lib/flags";
import type { NavKey } from "@/lib/nav";
import {
  featureEnabled,
  featureMetadata,
  HUB_FEATURES,
  hubNavKeys,
  loadFlags,
  requireFeature,
  type HubFeature,
} from "@/server/features";

// connection() needs a Next.js request scope; here it only has to be awaited.
const next = vi.hoisted(() => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  connection: next.connection,
}));

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

afterEach(() => {
  next.connection.mockClear();
});

describe("hubNavKeys (the shell's sections from the flags)", () => {
  const CORE: NavKey[] = ["today", "courses", "plan"];

  // Every combination of the three section flags.
  it.each([
    [true, true, true, [...CORE, "careers", "events", "alumni"]],
    [true, true, false, [...CORE, "careers", "events"]],
    [true, false, true, [...CORE, "careers", "alumni"]],
    [true, false, false, [...CORE, "careers"]],
    [false, true, true, [...CORE, "events"]],
    [false, true, false, [...CORE, "events"]],
    [false, false, true, [...CORE]],
    [false, false, false, [...CORE]],
  ] as const)("careers %s, events %s, alumni %s → %j", (careers, events, alumni, expected) => {
    const flags = { careers, events, alumni };
    expect(hubNavKeys(flags)).toEqual(expected);
    // The shell and the pages agree: a section is shown exactly when its pages exist.
    for (const feature of HUB_FEATURES) {
      expect(hubNavKeys(flags).includes(feature)).toBe(featureEnabled(flags, feature));
    }
  });

  it("shows everything with the default flags", () => {
    expect(hubNavKeys(getFlags({}))).toEqual([
      "today",
      "courses",
      "plan",
      "careers",
      "events",
      "alumni",
    ]);
  });
});

describe("featureEnabled", () => {
  it("needs Careers for Alumni, and nothing else for Careers or Events", () => {
    const off = { careers: false, events: false, alumni: false };
    expect(featureEnabled({ ...off, careers: true }, "careers")).toBe(true);
    expect(featureEnabled({ ...off, events: true }, "events")).toBe(true);
    expect(featureEnabled({ ...off, alumni: true }, "alumni")).toBe(false);
    expect(featureEnabled({ ...off, alumni: true, careers: true }, "alumni")).toBe(true);
    expect(featureEnabled({ careers: true, events: true, alumni: false }, "alumni")).toBe(false);
  });
});

describe("loadFlags", () => {
  it("is getFlags() for a well-formed environment, silently", () => {
    const log = vi.spyOn(console, "error");
    const source = { FEATURE_CAREERS: "false", FEATURE_EVENTS: "0", RMP_SUMMARIES_ENABLED: "1" };
    expect(loadFlags(source)).toEqual(getFlags(source));
    expect(loadFlags({})).toEqual(getFlags({}));
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a malformed flag and gives it its default, keeping the others", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const flags = loadFlags({
      FEATURE_EVENTS: "sometimes",
      FEATURE_CAREERS: "false",
      RMP_ENABLED: "maybe",
      RMP_SUMMARIES_ENABLED: "true",
    });
    expect(flags).toEqual({
      careers: false,
      events: true,
      alumni: true,
      ai: true,
      rmp: true,
      rmpSummaries: true,
    });
    // One line naming every malformed flag, never its value.
    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0]?.[0]);
    expect(message).toMatch(/FEATURE_EVENTS must be a boolean/);
    expect(message).toMatch(/RMP_ENABLED must be a boolean/);
    expect(message).not.toMatch(/sometimes|maybe/);
  });

  it("falls back to the defaults when every flag is malformed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = Object.fromEntries(
      [
        "FEATURE_CAREERS",
        "FEATURE_EVENTS",
        "FEATURE_ALUMNI",
        "AI_ENABLED",
        "RMP_ENABLED",
        "RMP_SUMMARIES_ENABLED",
      ].map((name) => [name, "yes please"]),
    );
    expect(loadFlags(bad)).toEqual(getFlags({}));
  });

  it("reads process.env by default", () => {
    vi.stubEnv("FEATURE_ALUMNI", "false");
    expect(loadFlags().alumni).toBe(false);
  });

  it("logs each distinct warning once per process, not on every request", () => {
    // Warnings are remembered for the whole file: this test uses flags no other test here makes malformed.
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const source = { AI_ENABLED: "maybe" };
    expect(loadFlags(source).ai).toBe(true);
    expect(loadFlags(source).ai).toBe(true);
    expect(loadFlags({ ...source }).ai).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toMatch(/AI_ENABLED must be a boolean/);

    // A different problem is news, and is logged (once) too.
    loadFlags({ ...source, FEATURE_ALUMNI: "maybe" });
    loadFlags({ ...source, FEATURE_ALUMNI: "maybe" });
    expect(log).toHaveBeenCalledTimes(2);
    expect(String(log.mock.calls[1]?.[0])).toMatch(/FEATURE_ALUMNI must be a boolean/);
  });
});

describe("requireFeature", () => {
  const cases: [HubFeature, Record<string, string>, boolean][] = [
    ["careers", {}, true],
    ["careers", { FEATURE_CAREERS: "false" }, false],
    ["careers", { FEATURE_EVENTS: "false", FEATURE_ALUMNI: "false" }, true],
    ["events", {}, true],
    ["events", { FEATURE_EVENTS: "false" }, false],
    ["events", { FEATURE_CAREERS: "false" }, true],
    ["alumni", {}, true],
    ["alumni", { FEATURE_ALUMNI: "false" }, false],
    ["alumni", { FEATURE_CAREERS: "false" }, false],
    ["alumni", { FEATURE_EVENTS: "false" }, true],
  ];

  it.each(cases)("%s with %j: open %s", async (feature, env, open) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const gate = requireFeature(feature);
    if (open) await expect(gate).resolves.toBeUndefined();
    else await expect(gate).rejects.toMatchObject(NOT_FOUND);
    // Per request, never at build time.
    expect(next.connection).toHaveBeenCalledTimes(1);
  });

  it("keeps a section open when its flag is malformed (the default is on), and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FEATURE_EVENTS", "sometimes");
    await expect(requireFeature("events")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});

describe("featureMetadata", () => {
  it("is the page's metadata while the section is on", async () => {
    await expect(featureMetadata("events", { title: "Events" })).resolves.toEqual({
      title: "Events",
    });
  });

  it("answers 404 while the section is off, so the 404 is never titled after it", async () => {
    vi.stubEnv("FEATURE_CAREERS", "false");
    await expect(featureMetadata("careers", { title: "Careers" })).rejects.toMatchObject(NOT_FOUND);
    await expect(featureMetadata("alumni", { title: "Alumni" })).rejects.toMatchObject(NOT_FOUND);
    await expect(featureMetadata("events", { title: "Events" })).resolves.toEqual({
      title: "Events",
    });
  });

  it("leaves the title to the hub's not-found page, which names no section", () => {
    expect(hubNotFoundMetadata).toEqual({ title: "Page not found" });
  });
});

describe("flagged hub pages", () => {
  const params = Promise.resolve({ slug: "software-engineering" });

  it.each([
    ["/careers", "FEATURE_CAREERS", careersPage, "Careers", () => careersPage.default()],
    [
      "/careers/[slug]",
      "FEATURE_CAREERS",
      careerPage,
      "Career path",
      () => careerPage.default({ params }),
    ],
    ["/events", "FEATURE_EVENTS", eventsPage, "Events", () => eventsPage.default()],
    ["/alumni", "FEATURE_ALUMNI", alumniPage, "Alumni", () => alumniPage.default()],
    ["/alumni", "FEATURE_CAREERS", alumniPage, "Alumni", () => alumniPage.default()],
  ] as const)("%s answers 404 while %s is off", async (_route, name, page, title, render) => {
    await expect(render()).resolves.toBeTruthy();
    await expect(page.generateMetadata()).resolves.toEqual({ title });
    vi.stubEnv(name, "false");
    await expect(render()).rejects.toMatchObject(NOT_FOUND);
    // The title too: Next.js keeps a static `metadata` export on the 404, which would name the hidden section in
    // the browser tab and to screen readers. generateMetadata answers 404 instead, so the not-found title is used.
    expect(page).not.toHaveProperty("metadata");
    await expect(page.generateMetadata()).rejects.toMatchObject(NOT_FOUND);
  });
});
