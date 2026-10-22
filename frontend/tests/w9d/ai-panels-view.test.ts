import { describe, expect, it } from "vitest";
import {
  careerAiView,
  coldEmailAlumni,
  panelsGridClass,
  type CareerAiViewInput,
} from "@/app/(hub)/careers/[slug]/_components/ai-panels";
import { getFlags, type Flags } from "@/lib/flags";
import { alumniForCareer } from "@/server/content/alumni";

/**
 * What the career page's AI panels show for each student (W9a-ai): signed out / AI off → nothing; the section
 * flags; the gate order; who gets the alumni list (verified @davidson.edu only, contactable only).
 */

const FLAGS: Flags = { ...getFlags({}), careers: true, alumni: true, ai: true };
const VERIFIED_AT = "2026-09-01T12:00:00.000Z";
const MEDICINE = alumniForCareer("medicine");

function input(overrides: Partial<CareerAiViewInput> = {}): CareerAiViewInput {
  return {
    careerSlug: "medicine",
    user: { email: "sam@davidson.edu", name: "Sam Student", emailVerifiedAt: VERIFIED_AT },
    flags: FLAGS,
    gateInput: { enabled: true, configured: true, verified: true, consented: true },
    mailAvailable: true,
    alumni: MEDICINE,
    ...overrides,
  };
}

describe("coldEmailAlumni", () => {
  it("keeps contactable alumni only, reduced to the picker's fields", () => {
    expect(MEDICINE.some((a) => !a.contactable)).toBe(true);
    const list = coldEmailAlumni(MEDICINE);
    expect(list.length).toBe(MEDICINE.filter((a) => a.contactable).length);
    expect(list.length).toBeGreaterThan(0);
    for (const alumnus of list) {
      expect(Object.keys(alumnus).sort()).toEqual(
        ["classYear", "contactable", "id", "name", "organization", "role"].sort(),
      );
      expect(alumnus.contactable).toBe(true);
    }
    const notable = MEDICINE.filter((a) => !a.contactable).map((a) => a.id);
    expect(list.map((a) => a.id)).not.toEqual(expect.arrayContaining([notable[0]]));
  });
});

describe("careerAiView", () => {
  it("is nothing for a signed-out visitor or while AI_ENABLED is off", () => {
    expect(careerAiView(input({ user: null }))).toBeNull();
    expect(careerAiView(input({ flags: { ...FLAGS, ai: false } }))).toBeNull();
    expect(careerAiView(input({ flags: { ...FLAGS, careers: false } }))).toBeNull();
  });

  it("an open student: both panels, no gate, the contactable alumni and the student's name", () => {
    const view = careerAiView(input())!;
    expect(view.sharedGate).toBeNull();
    expect(view.plan).toEqual({ gate: null });
    expect(view.email!.gate).toBeNull();
    expect(view.email!.alumni.map((a) => a.id)).toEqual(coldEmailAlumni(MEDICINE).map((a) => a.id));
    expect(view.studentName).toBe("Sam Student");
    expect(view.links).toEqual({
      verify: null,
      consent: "/profile#ai-features",
      signIn: "/login?callbackUrl=%2Fcareers%2Fmedicine",
    });
  });

  it("the Alumni section off: the career plan only", () => {
    const view = careerAiView(input({ flags: { ...FLAGS, alumni: false } }))!;
    expect(view.plan).toEqual({ gate: null });
    expect(view.email).toBeNull();
    // A lone panel takes the full width: no two-column track with an empty column beside it.
    expect(panelsGridClass(view)).not.toContain("lg:grid-cols");
    expect(panelsGridClass(careerAiView(input())!)).toContain(
      "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
    );
  });

  it("gate order: not_configured before unverified before consent_required, said once for both panels", () => {
    const notConfigured = careerAiView(
      input({ gateInput: { enabled: true, configured: false, verified: false, consented: false } }),
    )!;
    expect(notConfigured.sharedGate?.kind).toBe("not_configured");

    const unverified = careerAiView(
      input({
        user: { email: "sam@davidson.edu", name: "Sam", emailVerifiedAt: null },
        gateInput: { enabled: true, configured: true, verified: false, consented: true },
      }),
    )!;
    expect(unverified.sharedGate?.kind).toBe("unverified");
    expect(unverified.links.verify).toBe("/verify?reason=davidson&next=%2Fcareers%2Fmedicine");
    // No alumni data for an unverified account.
    expect(unverified.email!.alumni).toEqual([]);

    const consent = careerAiView(
      input({ gateInput: { enabled: true, configured: true, verified: true, consented: false } }),
    )!;
    expect(consent.sharedGate?.kind).toBe("consent_required");
  });

  it("no verify link for a legacy non-Davidson address, or while no mail provider can send the code", () => {
    const legacy = careerAiView(
      input({
        user: { email: "sam@gmail.com", name: "Sam", emailVerifiedAt: VERIFIED_AT },
        gateInput: { enabled: true, configured: true, verified: false, consented: true },
      }),
    )!;
    expect(legacy.links.verify).toBeNull();
    expect(legacy.email!.alumni).toEqual([]);

    const noMail = careerAiView(
      input({
        user: { email: "sam@davidson.edu", name: "Sam", emailVerifiedAt: null },
        gateInput: { enabled: true, configured: true, verified: false, consented: true },
        mailAvailable: false,
      }),
    )!;
    expect(noMail.links.verify).toBeNull();
  });

  it("never lists alumni the career does not have, and none at all for a career without contactable ones", () => {
    const marketing = careerAiView(
      input({ careerSlug: "marketing", alumni: alumniForCareer("marketing") }),
    )!;
    expect(alumniForCareer("marketing").length).toBeGreaterThan(0);
    expect(marketing.email!.alumni).toEqual([]);
  });
});
