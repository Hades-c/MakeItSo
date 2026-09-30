import { describe, expect, it } from "vitest";
import { PORTAL_LINK_CATEGORIES } from "@/lib/types/content";
import {
  getLink,
  HANDSHAKE,
  handshakeUrl,
  linkForSource,
  LINKS_VERIFIED_AT,
  linksByCategory,
  PORTAL_LINKS,
} from "@/server/content/links";

describe("portal links", () => {
  it("holds the verified links minus the Handshake SSO path", () => {
    expect(PORTAL_LINKS).toHaveLength(38);
    expect(getLink("handshake-sso")).toBeUndefined();
    expect(getLink("handshake")?.url).toBe("https://davidson.joinhandshake.com/");
    expect(getLink("davidsonian")?.url).toBe("https://thedavidsonian.news/");
    expect(LINKS_VERIFIED_AT).toBe("2026-09-30");
  });

  it("puts platform tags only on the platforms' own curated links", () => {
    const tagged = PORTAL_LINKS.filter((link) => link.source !== null).map((link) => [
      link.slug,
      link.source,
    ]);
    expect(tagged).toEqual([
      ["davidson-one", "davidson-one"],
      ["handshake", "handshake"],
      ["handshake-appointments", "handshake"],
      ["athletics-schedule", "athletics"],
    ]);
    expect(linkForSource("davidson-one")?.url).toBe(
      "https://one.davidson.edu/campusm/home#select-profile",
    );
    expect(linkForSource("athletics")?.url).toBe("https://davidsonwildcats.com/calendar");
    for (const link of PORTAL_LINKS) {
      if (link.source === "handshake")
        expect(link.url).toMatch(/^https:\/\/davidson\.joinhandshake\.com\//);
    }
  });

  it("never links the spam davidsonian.com domain or plain http", () => {
    for (const link of PORTAL_LINKS) {
      expect(link.url).toMatch(/^https:\/\//);
      expect(new URL(link.url).hostname).not.toMatch(/(^|\.)davidsonian\.com$/);
    }
  });

  it("groups links by category in the contract's order", () => {
    const groups = linksByCategory();
    expect(groups.map((g) => g.category)).toEqual(
      PORTAL_LINK_CATEGORIES.filter((c) => PORTAL_LINKS.some((l) => l.category === c)),
    );
    expect(groups.flatMap((g) => g.links)).toHaveLength(PORTAL_LINKS.length);
  });
});

describe("Handshake", () => {
  it("uses the documented base URL and no invented search template", () => {
    expect(HANDSHAKE).toMatchObject({
      baseUrl: "https://davidson.joinhandshake.com/",
      jobSearchUrlTemplate: null,
    });
    expect(HANDSHAKE.sources.length).toBeGreaterThan(0);
  });

  it("sends every search button to the base URL", () => {
    expect(handshakeUrl()).toBe("https://davidson.joinhandshake.com/");
    expect(handshakeUrl("software engineer")).toBe("https://davidson.joinhandshake.com/");
    expect(handshakeUrl("   ")).toBe("https://davidson.joinhandshake.com/");
  });
});
