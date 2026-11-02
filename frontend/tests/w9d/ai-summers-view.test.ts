import { describe, expect, it } from "vitest";
import { careerAiSummersView } from "@/app/(hub)/careers/[slug]/_components/ai-summers-panel";
import { getFlags, type Flags } from "@/lib/flags";

/**
 * What the career page's AI summer picks panel shows for each student: signed out, AI off or the careers section
 * off → nothing; otherwise the first gate the account fails (in place of the button), with its next step.
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
      gate: null,
      links: {
        verify: null,
        consent: "/profile#ai-features",
        signIn: "/login?callbackUrl=%2Fcareers%2Fsports-management",
      },
    });
  });

  it("the gate order: not set up → unverified (with the verify link while mail works) → consent", () => {
    expect(view({ gateInput: { ...OPEN, configured: false } })?.gate?.kind).toBe("not_configured");
    const unverified = view({
      user: { email: "sam@davidson.edu", emailVerifiedAt: null },
      gateInput: { ...OPEN, verified: false },
    })!;
    expect(unverified.gate?.kind).toBe("unverified");
    expect(unverified.links.verify).toBe(
      "/verify?reason=davidson&next=%2Fcareers%2Fsports-management",
    );
    expect(
      view({
        user: { email: "sam@davidson.edu", emailVerifiedAt: null },
        gateInput: { ...OPEN, verified: false },
        mailAvailable: false,
      })!.links.verify,
    ).toBeNull();
    expect(view({ gateInput: { ...OPEN, consented: false } })?.gate?.kind).toBe("consent_required");
  });
});
