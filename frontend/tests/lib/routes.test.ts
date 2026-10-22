import { describe, expect, it } from "vitest";
import {
  courseSlug,
  parseCourseSlug,
  parseOnboardingStep,
  parsePlanTab,
  parseTermParam,
  queryString,
  routes,
  safeCallbackPath,
} from "@/lib/routes";

describe("href builders (lib/routes.ts)", () => {
  it("builds every page", () => {
    expect(routes.course("202602", "CSC 221")).toBe("/courses/202602/CSC-221");
    expect(routes.course("202602", "csc221")).toBe("/courses/202602/CSC-221");
    expect(routes.career("software-engineering")).toBe("/careers/software-engineering");
    expect(routes.plan("next")).toBe("/plan?tab=next");
    expect(routes.plan()).toBe("/plan");
    expect(routes.plan("four-year", { term: "202602" })).toBe("/plan?tab=four-year&term=202602");
    expect(routes.courses()).toBe("/courses");
    expect(
      routes.courses({
        term: "202602",
        q: " data ",
        dept: ["CSC", "MAT"],
        openOnly: true,
        page: 1,
      }),
    ).toBe("/courses?term=202602&q=data&dept=CSC&dept=MAT&openOnly=true");
    expect(routes.events({ sources: ["wildcatsync"], q: "" })).toBe("/events?sources=wildcatsync");
    expect(routes.login("/plan?tab=next")).toBe("/login?callbackUrl=%2Fplan%3Ftab%3Dnext");
    expect([routes.today(), routes.alumni(), routes.profile(), routes.onboarding()]).toEqual([
      "/today",
      "/alumni",
      "/profile",
      "/onboarding",
    ]);
    expect(routes.forgotPassword()).toBe("/forgot-password");
    expect(routes.alumnus("stephen-curry")).toBe("/alumni#stephen-curry");
    expect(routes.alumni({ career: "law" })).toBe("/alumni?career=law");
    expect(routes.plan("next", { term: "202602", view: "print" })).toBe(
      "/plan?tab=next&term=202602&view=print",
    );
    expect(routes.today({ day: "2026-10-01" })).toBe("/today?day=2026-10-01");
    expect(routes.today({ day: "" })).toBe("/today");
    expect(routes.onboarding("classes")).toBe("/onboarding?step=classes");
    expect(routes.onboarding(undefined, { next: "/plan?tab=next" })).toBe(
      "/onboarding?next=%2Fplan%3Ftab%3Dnext",
    );
    expect(routes.onboarding("about", { next: "/plan" })).toBe(
      "/onboarding?step=about&next=%2Fplan",
    );
    expect(parseOnboardingStep(["interests", "about"])).toBe("interests");
    expect(parseOnboardingStep("finish")).toBeNull();
  });

  it("serialises query strings", () => {
    expect(queryString({ a: 1, b: ["x", "y"], c: undefined, d: "", e: false, f: true })).toBe(
      "?a=1&b=x&b=y&f=true",
    );
    expect(queryString({})).toBe("");
  });
});

describe("parsers", () => {
  it("parses course slugs", () => {
    expect(courseSlug("HIS 357")).toBe("HIS-357");
    expect(parseCourseSlug("CSC-221")).toBe("CSC 221");
    expect(parseCourseSlug("csc-221")).toBe("CSC 221");
    expect(parseCourseSlug("CSC%20221")).toBe("CSC 221");
    for (const bad of ["CSC", "221", "CSC-22", "%E0%A4%A", "../etc"]) {
      expect(parseCourseSlug(bad)).toBeNull();
    }
  });

  it("parses tabs and terms with safe defaults", () => {
    expect(parsePlanTab("summer")).toBe("summer");
    expect(parsePlanTab(["four-year", "next"])).toBe("four-year");
    expect(parsePlanTab("admin")).toBe("next");
    expect(parsePlanTab(undefined)).toBe("next");
    expect(parseTermParam("202602")).toBe("202602");
    expect(parseTermParam("2026")).toBeNull();
  });

  it("only honours same-origin callback URLs", () => {
    const origin = "https://make-it-so.vercel.app";
    expect(safeCallbackPath("/plan?tab=next", origin)).toBe("/plan?tab=next");
    expect(safeCallbackPath(`${origin}/courses#x`, origin)).toBe("/courses#x");
    for (const bad of [
      "https://evil.example/plan",
      "//evil.example/plan",
      "/\\evil.example",
      "javascript:alert(1)",
      "plan",
      "/login?callbackUrl=/x",
      "",
      null,
      // Dot segments that normalise into a protocol-relative path to another host.
      "/.//evil.com",
      "/..//evil.com",
      "/a/..//evil.com",
      "/%2e//evil.com/x",
      "/./\\evil.com",
      "/.\\/evil.com",
      `${origin}/.//evil.com`,
    ]) {
      expect([bad, safeCallbackPath(bad, origin)]).toEqual([bad, "/today"]);
    }
    // Dot segments that stay on this origin are fine (and normalised).
    expect(safeCallbackPath("/a/../plan?tab=next", origin)).toBe("/plan?tab=next");
    expect(safeCallbackPath("/./courses", origin)).toBe("/courses");
  });
});
