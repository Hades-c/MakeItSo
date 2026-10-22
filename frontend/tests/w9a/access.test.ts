import { describe, expect, it, vi } from "vitest";
import { alumniAccessFor, alumniGateCopy } from "@/app/(hub)/alumni/_lib/access";
import { UNVERIFIED_MESSAGE } from "@/lib/api/account";
import { getFlags } from "@/lib/flags";
import { VERIFICATION_UNAVAILABLE_MESSAGE } from "@/server/auth/verification";

const ON = getFlags({});
const VERIFIED_AT = "2026-09-01T12:00:00.000Z";

const davidson = { email: "sam@davidson.edu", emailVerifiedAt: VERIFIED_AT };
const unverified = { email: "sam@davidson.edu", emailVerifiedAt: null };
const legacyVerified = { email: "old.friend@gmail.com", emailVerifiedAt: VERIFIED_AT };
const legacy = { email: "old.friend@gmail.com", emailVerifiedAt: null };

describe("alumniAccessFor (PLAN §1: verified @davidson.edu + FEATURE_ALUMNI)", () => {
  const mail = () => true;

  it("opens alumni to a verified @davidson.edu account while the section is on", () => {
    expect(alumniAccessFor(davidson, ON, mail)).toEqual({ kind: "open" });
    // Upper case and spaces normalise like sign-up does.
    expect(alumniAccessFor({ ...davidson, email: " Sam@Davidson.EDU " }, ON, mail)).toEqual({
      kind: "open",
    });
  });

  it("is off (nothing about alumni at all) while FEATURE_ALUMNI or FEATURE_CAREERS is off", () => {
    expect(alumniAccessFor(davidson, { ...ON, alumni: false }, mail)).toEqual({ kind: "off" });
    expect(alumniAccessFor(davidson, { ...ON, careers: false }, mail)).toEqual({ kind: "off" });
    expect(alumniAccessFor(legacy, { ...ON, alumni: false }, mail)).toEqual({ kind: "off" });
  });

  it("asks an unverified @davidson.edu account to verify (saying whether it can)", () => {
    expect(alumniAccessFor(unverified, ON, () => true)).toEqual({
      kind: "verify",
      mailAvailable: true,
    });
    expect(alumniAccessFor(unverified, ON, () => false)).toEqual({
      kind: "verify",
      mailAvailable: false,
    });
    expect(alumniAccessFor({ email: "sam@davidson.edu" }, ON, mail).kind).toBe("verify");
  });

  it("never opens alumni to other addresses, even with a verified mailbox", () => {
    expect(alumniAccessFor(legacyVerified, ON, mail)).toEqual({ kind: "davidson-only" });
    expect(alumniAccessFor(legacy, ON, mail)).toEqual({ kind: "davidson-only" });
    expect(
      alumniAccessFor(
        { email: "x@davidson.edu.evil.example", emailVerifiedAt: VERIFIED_AT },
        ON,
        mail,
      ),
    ).toEqual({
      kind: "davidson-only",
    });
    expect(alumniAccessFor(null, ON, mail)).toEqual({ kind: "davidson-only" });
  });

  it("asks about mail only for accounts that could verify", () => {
    const mailAvailable = vi.fn(() => true);
    alumniAccessFor(davidson, ON, mailAvailable);
    alumniAccessFor(legacy, ON, mailAvailable);
    alumniAccessFor(davidson, { ...ON, alumni: false }, mailAvailable);
    expect(mailAvailable).not.toHaveBeenCalled();
  });
});

describe("alumniGateCopy", () => {
  it("offers verification, coming back to the page", () => {
    const copy = alumniGateCopy({ kind: "verify", mailAvailable: true }, "/alumni?career=law");
    expect(copy.message).toContain(UNVERIFIED_MESSAGE);
    expect(copy.action).toEqual({
      label: "Verify your email",
      href: "/verify?reason=davidson&next=%2Falumni%3Fcareer%3Dlaw",
    });
  });

  it("says verification is not available yet when there is no mail provider", () => {
    const copy = alumniGateCopy({ kind: "verify", mailAvailable: false }, "/alumni");
    expect(copy.message).toBe(VERIFICATION_UNAVAILABLE_MESSAGE);
    expect(copy.action).toBeNull();
  });

  it("gives legacy non-Davidson accounts the owner's message and no verify button", () => {
    const copy = alumniGateCopy({ kind: "davidson-only" }, "/careers/law");
    expect(copy.message).toBe(UNVERIFIED_MESSAGE);
    expect(copy.action).toBeNull();
  });
});
