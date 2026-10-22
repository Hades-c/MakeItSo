import mongoose from "mongoose";
import type { Session } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import {
  errorOf,
  getRequest,
  insertUser,
  jsonRequest,
  sessionFor,
  stubAuthEnv,
  stubNowPlus,
} from "./helpers";
import { DELETE as revokeConsent, PUT as grantConsent } from "@/app/api/profile/ai-consent/route";
import { GET, PATCH } from "@/app/api/profile/route";
import { ProfileResponseSchema } from "@/lib/api/profile";
import User from "@/models/User";
import {
  defaultFirstTerm,
  matchOfficialName,
  officialNames,
  programNameCore,
} from "@/server/auth/profile";
import { getDb } from "@/server/db";
import type * as ProgramsModule from "@/server/programs";

const auth = vi.hoisted(() => ({ session: null as Session | null }));
const programs = vi.hoisted(() => ({ names: null as Record<string, string[]> | null }));

vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));
// server/programs is mocked: "off" (a 501, so the profile uses the checked-in Acalog snapshot's official names)
// unless a test switches it "on" with its own official names.
vi.mock("@/server/programs", async () => {
  const { notImplemented } = await import("@/server/http/errors");
  return {
    officialProgramNames: async (kind: string) => {
      if (!programs.names) throw notImplemented("officialProgramNames");
      return programs.names[kind] ?? [];
    },
  };
});

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  auth.session = null;
  programs.names = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function signedIn(raw: Record<string, unknown> = {}) {
  const user = await insertUser({
    email: "sam@davidson.edu",
    raw: { emailVerifiedAt: null, sessionVersion: 0, graduationYear: 2030, ...raw },
  });
  auth.session = await sessionFor(user);
  return user;
}

const get = () => GET(getRequest("/api/profile"));
const patch = (body: unknown, headers?: Record<string, string>) =>
  PATCH(jsonRequest("/api/profile", { method: "PATCH", body, headers }));

async function profileOf(res: Response) {
  expect(res.status).toBe(200);
  const json = (await res.json()) as { profile: Record<string, unknown> };
  ProfileResponseSchema.parse(json);
  return json.profile;
}

async function raw(id: string) {
  return User.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
}

describe("GET /api/profile", () => {
  it("needs a session", async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toEqual({ code: "unauthorized", message: "Sign in to continue." });
  });

  it("returns the Profile contract, the derived standing, never the password; never cached", async () => {
    const user = await signedIn();
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const profile = await profileOf(res);
    expect(profile).toEqual({
      id: user.id,
      name: user.name,
      email: "sam@davidson.edu",
      emailVerifiedAt: null,
      davidson: true,
      majors: [],
      minors: [],
      graduationYear: 2030,
      firstTerm: null,
      standingOverride: null,
      interests: [],
      aiConsentAt: null,
      adultAttestedAt: null,
      onboardedAt: null,
      createdAt: "2026-09-30T16:00:00.000Z",
      standing: { standing: "first-year", estimated: true },
    });
    expect(JSON.stringify(profile)).not.toMatch(/\$2[aby]\$/);
  });

  it("maps a legacy single major/minor to official names on read (and drops unknown ones)", async () => {
    await signedIn({ major: "computer science", minor: "Economics", careerInterests: ["Law"] });
    expect(await profileOf(await get())).toMatchObject({
      majors: ["Major in Computer Science (B.S. Degree)"],
      minors: ["Minor in Economics"],
      interests: [],
    });
    await User.updateMany({}, { $set: { major: "Undecided", minor: "Basket weaving" } });
    expect(await profileOf(await get())).toMatchObject({ majors: [], minors: [] });
  });

  it("uses the Acalog names from server/programs once it is implemented", async () => {
    programs.names = {
      major: ["Major in Computer Science (B.S. Degree)", "Major in History"],
      minor: ["Minor in Economics"],
      "interdisciplinary-minor": ["Interdisciplinary Minor in Data Science"],
    };
    const user = await signedIn({ major: "Computer Science", minors: ["Economics"] });
    expect(await profileOf(await get())).toMatchObject({
      majors: ["Major in Computer Science (B.S. Degree)"],
      minors: ["Minor in Economics"],
    });
    const res = await patch({ minors: ["Interdisciplinary Minor in Data Science"] });
    expect((await profileOf(res)).minors).toEqual(["Interdisciplinary Minor in Data Science"]);
    expect((await raw(user.id))?.minor).toBe("Interdisciplinary Minor in Data Science");
  });

  it("maps legacy documents without createdAt or graduationYear safely", async () => {
    const user = await signedIn({ graduationYear: undefined, createdAt: undefined });
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(user.id) },
      { $unset: { graduationYear: "", createdAt: "" } },
    );
    const profile = await profileOf(await get());
    expect(profile.graduationYear).toBe(2030);
    expect(profile.createdAt).toBe(
      new mongoose.Types.ObjectId(user.id).getTimestamp().toISOString(),
    );
  });
});

describe("PATCH /api/profile (strict whitelist)", () => {
  it("updates majors and minors (official names only) and mirrors the legacy fields", async () => {
    const user = await signedIn();
    const profile = await profileOf(
      await patch({ majors: ["History", "Computer Science", "History"], minors: ["Economics"] }),
    );
    // A name in any spelling of an official program is stored as the official name.
    expect(profile).toMatchObject({
      majors: ["Major in History (A.B. Degree)", "Major in Computer Science (B.S. Degree)"],
      minors: ["Minor in Economics"],
    });
    expect(await raw(user.id)).toMatchObject({
      major: "Major in History (A.B. Degree)",
      minor: "Minor in Economics",
    });

    const cleared = await profileOf(await patch({ majors: [], minors: [] }));
    expect(cleared).toMatchObject({ majors: [], minors: [] });
    const stored = await raw(user.id);
    expect(stored?.major).toBe("Undecided");
    expect(stored && "minor" in stored).toBe(false);
  });

  it("rejects names that are not official programs", async () => {
    await signedIn();
    const res = await patch({ majors: ["Computer Science", "Underwater Basket Weaving"] });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).issues).toEqual([
      { path: "majors.1", message: "Pick a name from the list of programs." },
    ]);
    for (const body of [
      { majors: ["$where"] },
      { majors: ["A", "B", "C", "D"] },
      { minors: [""] },
    ]) {
      expect((await patch(body)).status).toBe(400);
    }
  });

  it("sets and clears (null → $unset) firstTerm and standingOverride", async () => {
    const user = await signedIn();
    const set = await profileOf(
      await patch({ firstTerm: "202601", standingOverride: "sophomore" }),
    );
    expect(set).toMatchObject({
      firstTerm: "202601",
      standingOverride: "sophomore",
      standing: { standing: "sophomore", estimated: false },
    });
    const cleared = await profileOf(await patch({ firstTerm: null, standingOverride: null }));
    expect(cleared).toMatchObject({ firstTerm: null, standingOverride: null });
    const stored = await raw(user.id);
    expect(stored && ("firstTerm" in stored || "standingOverride" in stored)).toBe(false);
  });

  it("checks that the first term fits the graduation year and is not a summer", async () => {
    await signedIn();
    expect((await errorOf(await patch({ firstTerm: "202503" }))).issues?.[0]?.path).toBe(
      "firstTerm",
    );
    expect((await patch({ firstTerm: "203001" })).status).toBe(400);
    expect((await patch({ firstTerm: "201001" })).status).toBe(400);
    expect((await patch({ firstTerm: "not-a-term" })).status).toBe(400);
    expect((await patch({ firstTerm: defaultFirstTerm(2030) })).status).toBe(200);
    const mismatch = await patch({ graduationYear: 2026 });
    expect((await errorOf(mismatch)).issues?.[0]?.path).toBe("graduationYear");
    expect(defaultFirstTerm(2030)).toBe("202601");
  });

  it("stores interests as de-duplicated career slugs", async () => {
    await signedIn();
    expect(
      (await profileOf(await patch({ interests: ["software-engineering", "law", "law"] })))
        .interests,
    ).toEqual(["software-engineering", "law"]);
    expect((await patch({ interests: ["Software Engineering"] })).status).toBe(400);
  });

  it("AI consent needs the 18+ attestation; turning either off clears the consent", async () => {
    const user = await signedIn();
    const refused = await patch({ aiConsent: true });
    expect(refused.status).toBe(400);
    expect((await errorOf(refused)).issues?.[0]?.path).toBe("aiConsent");

    const granted = await profileOf(await patch({ aiConsent: true, adultAttested: true }));
    expect(granted).toMatchObject({
      aiConsentAt: "2026-09-30T16:00:00.000Z",
      adultAttestedAt: "2026-09-30T16:00:00.000Z",
    });
    // Consenting again keeps the original time.
    stubNowPlus(3_600_000);
    expect((await profileOf(await patch({ aiConsent: true }))).aiConsentAt).toBe(
      "2026-09-30T16:00:00.000Z",
    );

    expect((await profileOf(await patch({ aiConsent: false }))).aiConsentAt).toBeNull();
    await patch({ aiConsent: true });
    const withdrawn = await profileOf(await patch({ adultAttested: false }));
    expect(withdrawn).toMatchObject({ aiConsentAt: null, adultAttestedAt: null });
    expect((await patch({ adultAttested: false, aiConsent: true })).status).toBe(400);
    const stored = await raw(user.id);
    expect(stored && ("aiConsentAt" in stored || "adultAttestedAt" in stored)).toBe(false);
  });

  it("sets onboardedAt once", async () => {
    await signedIn();
    expect((await profileOf(await patch({ onboarded: true }))).onboardedAt).toBe(
      "2026-09-30T16:00:00.000Z",
    );
    stubNowPlus(86_400_000);
    expect((await profileOf(await patch({ onboarded: true }))).onboardedAt).toBe(
      "2026-09-30T16:00:00.000Z",
    );
    expect((await patch({ onboarded: false })).status).toBe(400);
  });

  it("rejects every field outside the whitelist, prototype keys and $-keys (no mass assignment)", async () => {
    const user = await signedIn();
    const before = await raw(user.id);
    for (const body of [
      { email: "attacker@example.com" },
      { password: "x" },
      { emailVerifiedAt: "2026-09-30T16:00:00.000Z" },
      { sessionVersion: 0 },
      { legacyAccount: true },
      { major: "Biology" },
      { bio: "hi" },
      { careerInterests: ["Law"] },
      { aiConsentAt: "2026-09-30T16:00:00.000Z" },
      JSON.parse('{"__proto__": {"polluted": true}}'),
      JSON.parse('{"constructor": {"prototype": {"polluted": true}}}'),
      { $set: { email: "attacker@example.com" } },
      { "majors.0": "Biology" },
      { name: { $gt: "" } },
      { name: "" },
      [],
      "name",
    ]) {
      const res = await patch(body);
      expect(res.status).toBe(400);
    }
    expect(await raw(user.id)).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("stores $-looking strings as plain text", async () => {
    await signedIn();
    expect((await profileOf(await patch({ name: "$gt Casey" }))).name).toBe("$gt Casey");
  });

  it("is same-origin JSON only", async () => {
    await signedIn();
    expect((await patch({ name: "X" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await patch("name=X", { "content-type": "text/plain" })).status).toBe(415);
    expect((await patch({ name: "Casey" })).headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("the dedicated AI consent endpoint", () => {
  it("PUT records attestation + consent; DELETE turns AI off and keeps the attestation", async () => {
    await signedIn();
    const put = (body: unknown) =>
      grantConsent(jsonRequest("/api/profile/ai-consent", { method: "PUT", body }));
    expect((await put({})).status).toBe(400);
    expect((await put({ adultAttested: false })).status).toBe(400);
    const granted = await profileOf(await put({ adultAttested: true }));
    expect(granted).toMatchObject({
      aiConsentAt: "2026-09-30T16:00:00.000Z",
      adultAttestedAt: "2026-09-30T16:00:00.000Z",
    });
    const revoked = await profileOf(
      await revokeConsent(jsonRequest("/api/profile/ai-consent", { method: "DELETE" })),
    );
    expect(revoked).toMatchObject({
      aiConsentAt: null,
      adultAttestedAt: "2026-09-30T16:00:00.000Z",
    });
  });

  it("needs a session", async () => {
    expect(
      (await revokeConsent(jsonRequest("/api/profile/ai-consent", { method: "DELETE" }))).status,
    ).toBe(401);
  });
});

describe("official program names", () => {
  it("fall back to the checked-in Acalog snapshot while server/programs cannot answer", async () => {
    const majors = await officialNames("major");
    expect(majors.source).toBe("snapshot");
    expect(majors.names).toContain("Major in Computer Science (B.S. Degree)");
    expect(majors.names).not.toContain("Computer Science");
    expect(majors.names).not.toContain("Undecided");
    // The same official names programNames() serves (the zod enums of the profile and the AI).
    const actual = await vi.importActual<typeof ProgramsModule>("@/server/programs");
    const names = await actual.programNames();
    expect(majors.names).toEqual(names.majors);
    expect((await officialNames("minor")).names).toEqual(names.minors);
  });

  it("match by core name", () => {
    expect(programNameCore("Major in Computer Science (B.S. Degree)")).toBe("computer science");
    expect(programNameCore("Interdisciplinary Minor in Data Science")).toBe("data science");
    expect(programNameCore("French & Francophone Studies")).toBe("french and francophone studies");
    const names = [
      "Major in Computer Science (B.S. Degree)",
      "Major in French and Francophone Studies",
    ];
    expect(matchOfficialName("computer science", names)).toBe(names[0]);
    expect(matchOfficialName("French & Francophone Studies", names)).toBe(names[1]);
    expect(matchOfficialName("Computer", names)).toBeNull();
    expect(matchOfficialName("  ", names)).toBeNull();
  });
});
