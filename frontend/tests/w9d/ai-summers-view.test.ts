import { describe, expect, it } from "vitest";
import { careerAiSummersView } from "@/app/(hub)/careers/[slug]/_components/ai-summers-panel";
import { getFlags, type Flags } from "@/lib/flags";
import { VERIFIED_ONLY_AI_FEATURES } from "@/server/ai/access";
import { aiFeatureEnabled } from "@/server/ai/gate";

/**
 * What the career page's AI summer picks panel shows for each student: signed out, AI off or the careers section
 * off → nothing; a gate the account fails → nothing too (the "AI for this path" card below says it once); otherwise
 * the button with the page's next-step links.
 */

const FLAGS: Flags = { ...getFlags({}), careers: true, alumni: true, ai: true };
const OPEN = { enabled: true, configured: true, verified: true, consented: true };

function view(overrides: Partial<Parameters<typeof careerAiSummersView>[0]> = {}) {
  return careerAiSummersView({
    careerSlug: "sports-management",
    user: { email: "sam@davidson.edu", emailVerifiedAt: "2026-09-01T12:00:00.000Z" },
    flags: FLAGS,
    gateInput: OPEN,
    mailAvailable: true,
    ...overrides,
  });
}

describe("careerAiSummersView", () => {
  it("is nothing for a signed-out visitor, while AI_ENABLED is off, or with the careers section off", () => {
    expect(view({ user: null })).toBeNull();
    expect(view({ flags: { ...FLAGS, ai: false } })).toBeNull();
    expect(view({ flags: { ...FLAGS, careers: false } })).toBeNull();
  });

  it("an open student: no gate, the page's next-step links", () => {
    expect(view()).toEqual({
      links: {
        verify: null,
        consent: "/profile#ai-features",
        signIn: "/login?callbackUrl=%2Fcareers%2Fsports-management",
      },
    });
  });

  it("is nothing while a gate fails (not set up, unverified, no consent): the AI card below says it once", () => {
    expect(view({ gateInput: { ...OPEN, configured: false } })).toBeNull();
    expect(
      view({
        user: { email: "sam@davidson.edu", emailVerifiedAt: null },
        gateInput: { ...OPEN, verified: false },
      }),
    ).toBeNull();
    expect(view({ gateInput: { ...OPEN, consented: false } })).toBeNull();
  });

  it("gates exactly like the career plan, whose card carries the shared notice", () => {
    // Same section flag, same verification rule (consent is the account's): the plan's notice is the summers' too.
    for (const flags of [FLAGS, { ...FLAGS, careers: false }, { ...FLAGS, alumni: false }]) {
      expect(aiFeatureEnabled(flags, "career-summers")).toBe(
        aiFeatureEnabled(flags, "career-plan"),
      );
    }
    expect(VERIFIED_ONLY_AI_FEATURES).not.toContain("career-summers");
    expect(VERIFIED_ONLY_AI_FEATURES).not.toContain("career-plan");
  });
});
