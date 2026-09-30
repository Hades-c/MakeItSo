import "server-only";
import mongoose from "mongoose";
import { isDavidsonEmail } from "@/lib/api/account";
import type { ApiIssue } from "@/lib/api/errors";
import { type Profile, type ProfilePatchBody, ProfilePatchBodySchema } from "@/lib/api/profile";
import { dayKey } from "@/lib/format";
import {
  CLASS_STANDINGS,
  classStanding,
  isSummer,
  isTermCode,
  termCodeFor,
  TERM_TIME_ZONE,
  type ClassStanding,
  type ClassStandingResult,
  type TermCode,
} from "@/lib/term";
import type { ProgramOfferingKind } from "@/lib/types/catalog";
import { SlugSchema } from "@/lib/types/common";
import User, { type IUser } from "@/models/User";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError, zodIssues } from "@/server/http/errors";
import { officialProgramNames } from "@/server/programs";
import { snapshotOfferingNames } from "@/server/programs/snapshot";

/**
 * The student profile (lib/api/profile.ts; PLAN §6.1 W3 "Profile"). Server components call getProfile() directly;
 * GET/PATCH /api/profile and the AI-consent endpoint are thin wrappers.
 *
 * Reading (toProfile):
 *   - majors/minors are official program names: from server/programs (Acalog, W1b), or the checked-in Acalog
 *     snapshot (server/programs/snapshot.json) when the service cannot answer. Stored names are matched to the
 *     current official list by
 *     their core ("Computer Science" ↔ "Major in Computer Science (B.S. Degree)"); a legacy single `major` /
 *     `minor` string is mapped the same way, and dropped when it matches nothing (or is "Undecided").
 *   - graduationYear defaults to the first-year class; `standing` is derived with lib/term classStanding (a
 *     student-set standingOverride wins and is not an estimate).
 *   - Missing timestamps are null. Legacy fields (currentYear, bio, careerInterests, totalCreditsRequired) are
 *     ignored, never deleted.
 *
 * Writing (updateProfile): the strict ProfilePatchBodySchema whitelist, then these rules:
 *   - null clears (`$unset`) the clearable fields firstTerm and standingOverride; [] clears a list;
 *   - majors/minors must be official names (max 3, de-duplicated); `major`/`minor` are mirrored for rollback;
 *   - firstTerm is a Fall or Spring term between 8 academic years before graduation and the graduation spring;
 *   - aiConsent: true needs the 18+ attestation (stored, or adultAttested: true in the same request) and sets
 *     aiConsentAt once; false clears it. adultAttested: false clears the attestation AND the consent;
 *   - onboarded: true sets onboardedAt once. Nothing else can be written (no email, password, flags, $-keys).
 */

export type ProfileView = Profile & {
  /** Derived class standing (lib/term classStanding). */
  standing: ClassStandingResult;
};

// ---- Dates ---------------------------------------------------------------------------------------------------

/** The calendar year the current academic year ends in (it rolls over on June 1, ET). */
export function academicYearEnd(at: Date): number {
  const [yearText, monthText] = dayKey(at, TERM_TIME_ZONE).split("-");
  return Number(monthText) >= 6 ? Number(yearText) + 1 : Number(yearText);
}

/** Graduation year of this year's first-year class (the registration default). */
export function defaultGraduationYear(at: Date): number {
  return academicYearEnd(at) + 3;
}

/** The usual first term for a graduation year: Fall, four years before (onboarding's default). */
export function defaultFirstTerm(graduationYear: number): TermCode {
  return termCodeFor("Fall", graduationYear - 4);
}

// ---- Official program names ----------------------------------------------------------------------------------

export type ProgramKind = "major" | "minor";

export interface OfficialNames {
  names: string[];
  /**
   * "programs" = server/programs (Acalog, the synced list); "snapshot" = the same official names from the
   * checked-in Acalog snapshot, used when the programs service cannot answer (e.g. the database is down).
   */
  source: "programs" | "snapshot";
}

const KINDS_OF: Readonly<Record<ProgramKind, readonly ProgramOfferingKind[]>> = {
  major: ["major"],
  minor: ["minor", "interdisciplinary-minor"],
};

async function namesFromPrograms(kind: ProgramKind): Promise<string[]> {
  if (kind === "major") return officialProgramNames("major");
  const [minors, interdisciplinary] = await Promise.all([
    officialProgramNames("minor"),
    officialProgramNames("interdisciplinary-minor"),
  ]);
  return [...minors, ...interdisciplinary];
}

/**
 * The official names for majors or minors: the programs service first, the checked-in Acalog snapshot when it
 * cannot answer. Both are official Acalog names, so profile validation never accepts anything else. "Undecided"
 * is not a program: a picker may offer it as a UI-only choice that saves `majors: []`.
 */
export async function officialNames(kind: ProgramKind): Promise<OfficialNames> {
  try {
    const names = [...new Set(await namesFromPrograms(kind))].filter(Boolean);
    if (names.length > 0) return { names, source: "programs" };
  } catch (error) {
    // 501 = a stubbed service (tests); anything else is logged. Either way the snapshot keeps the profile usable.
    if (!(error instanceof ApiError && error.status === 501)) {
      console.error(`[profile] official ${kind} names unavailable, using the snapshot:`, error);
    }
  }
  return { names: snapshotOfferingNames(KINDS_OF[kind]), source: "snapshot" };
}

/** "Major in Computer Science (B.S. Degree)" → "computer science"; "French & Francophone Studies" → "french and …". */
export function programNameCore(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^\s*(?:interdisciplinary\s+)?(?:major|minor|concentration)\s+in\s+/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The official name `input` refers to: exact match first, then a unique match by core; null otherwise. */
export function matchOfficialName(input: string, names: readonly string[]): string | null {
  const trimmed = input.trim();
  if (names.includes(trimmed)) return trimmed;
  const core = programNameCore(trimmed);
  if (!core) return null;
  const matches = names.filter((name) => programNameCore(name) === core);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

// ---- Reading -------------------------------------------------------------------------------------------------

type ProfileSource = Pick<
  IUser,
  | "_id"
  | "name"
  | "email"
  | "emailVerifiedAt"
  | "majors"
  | "minors"
  | "major"
  | "minor"
  | "graduationYear"
  | "firstTerm"
  | "standingOverride"
  | "interests"
  | "aiConsentAt"
  | "adultAttestedAt"
  | "onboardedAt"
  | "createdAt"
>;

function iso(value: unknown): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

function mapStored(values: readonly unknown[], names: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    // A stored name was valid when it was written; keep it when the official list no longer has it verbatim.
    const name = matchOfficialName(value, names) ?? value.trim();
    if (!out.includes(name)) out.push(name);
  }
  return out.slice(0, 3);
}

function mapLegacy(value: unknown, names: readonly string[]): string[] {
  if (typeof value !== "string") return [];
  const match = matchOfficialName(value, names);
  return match ? [match] : [];
}

function isStanding(value: unknown): value is ClassStanding {
  return typeof value === "string" && (CLASS_STANDINGS as readonly string[]).includes(value);
}

/** A stored user document as the Profile the app reads (see the module comment). */
export function toProfile(
  doc: ProfileSource,
  at: Date,
  names: { majors: readonly string[]; minors: readonly string[] },
): ProfileView {
  const graduationYear =
    typeof doc.graduationYear === "number" && Number.isInteger(doc.graduationYear)
      ? doc.graduationYear
      : defaultGraduationYear(at);
  const standingOverride = isStanding(doc.standingOverride) ? doc.standingOverride : null;
  const id =
    doc._id instanceof mongoose.Types.ObjectId
      ? doc._id
      : new mongoose.Types.ObjectId(String(doc._id));
  return {
    id: id.toString(),
    name: doc.name ?? "",
    email: doc.email,
    emailVerifiedAt: iso(doc.emailVerifiedAt),
    davidson: isDavidsonEmail(doc.email),
    majors: Array.isArray(doc.majors)
      ? mapStored(doc.majors, names.majors)
      : mapLegacy(doc.major, names.majors),
    minors: Array.isArray(doc.minors)
      ? mapStored(doc.minors, names.minors)
      : mapLegacy(doc.minor, names.minors),
    graduationYear,
    firstTerm:
      typeof doc.firstTerm === "string" && isTermCode(doc.firstTerm) ? doc.firstTerm : null,
    standingOverride,
    interests: (doc.interests ?? [])
      .filter((slug): slug is string => SlugSchema.safeParse(slug).success)
      .slice(0, 24),
    aiConsentAt: iso(doc.aiConsentAt),
    adultAttestedAt: iso(doc.adultAttestedAt),
    onboardedAt: iso(doc.onboardedAt),
    createdAt: iso(doc.createdAt) ?? id.getTimestamp().toISOString(),
    standing: classStanding(graduationYear, at, standingOverride),
  };
}

const PROFILE_FIELDS =
  "name email emailVerifiedAt majors minors major minor graduationYear firstTerm standingOverride interests aiConsentAt adultAttestedAt onboardedAt createdAt";

async function loadNames() {
  const [majors, minors] = await Promise.all([officialNames("major"), officialNames("minor")]);
  return { majors: majors.names, minors: minors.names };
}

async function loadProfileDoc(userId: string): Promise<ProfileSource> {
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(404, "not_found", "Account not found.");
  await getDb();
  const doc = await User.findById(userId).select(PROFILE_FIELDS).lean();
  if (!doc) throw new ApiError(404, "not_found", "Account not found.");
  return doc;
}

export async function getProfile(userId: string): Promise<ProfileView> {
  const [doc, names] = await Promise.all([loadProfileDoc(userId), loadNames()]);
  return toProfile(doc, now(), names);
}

// ---- Writing -------------------------------------------------------------------------------------------------

function resolveNames(
  field: "majors" | "minors",
  values: readonly string[],
  official: readonly string[],
  issues: ApiIssue[],
): string[] {
  const out: string[] = [];
  values.forEach((value, index) => {
    const name = matchOfficialName(value, official);
    if (!name) {
      issues.push({ path: `${field}.${index}`, message: "Pick a name from the list of programs." });
    } else if (!out.includes(name)) {
      out.push(name);
    }
  });
  return out;
}

/** Apply a profile patch (see the module comment). Throws ApiError(400) with field issues. */
export async function updateProfile(userId: string, patch: ProfilePatchBody): Promise<ProfileView> {
  const parsed = ProfilePatchBodySchema.safeParse(patch);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "validation_failed",
      "Some fields are invalid.",
      zodIssues(parsed.error),
    );
  }
  const input = parsed.data;
  const at = now();
  const [doc, names] = await Promise.all([loadProfileDoc(userId), loadNames()]);

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  const issues: ApiIssue[] = [];

  if (input.name !== undefined) set.name = input.name;

  if (input.majors !== undefined) {
    const majors = resolveNames("majors", input.majors, names.majors, issues);
    set.majors = majors;
    set.major = majors[0] ?? "Undecided";
  }
  if (input.minors !== undefined) {
    const minors = resolveNames("minors", input.minors, names.minors, issues);
    set.minors = minors;
    if (minors[0]) set.minor = minors[0];
    else unset.minor = "";
  }

  const graduationYear =
    input.graduationYear ??
    (typeof doc.graduationYear === "number" ? doc.graduationYear : defaultGraduationYear(at));
  if (input.graduationYear !== undefined) set.graduationYear = input.graduationYear;

  const firstTerm = input.firstTerm === undefined ? (doc.firstTerm ?? null) : input.firstTerm;
  if (input.firstTerm === null) unset.firstTerm = "";
  else if (input.firstTerm !== undefined) set.firstTerm = input.firstTerm;
  if (firstTerm && (input.firstTerm !== undefined || input.graduationYear !== undefined)) {
    const startYear = Number(firstTerm.slice(0, 4));
    if (isSummer(firstTerm)) {
      issues.push({ path: "firstTerm", message: "Pick a Fall or Spring term." });
    } else if (startYear > graduationYear - 1 || startYear < graduationYear - 8) {
      issues.push({
        path: input.firstTerm !== undefined ? "firstTerm" : "graduationYear",
        message: "The first term and the graduation year do not fit together.",
      });
    }
  }

  if (input.standingOverride === null) unset.standingOverride = "";
  else if (input.standingOverride !== undefined) set.standingOverride = input.standingOverride;

  if (input.interests !== undefined) set.interests = [...new Set(input.interests)];

  if (input.adultAttested === true) set.adultAttestedAt = doc.adultAttestedAt ?? at;
  if (input.adultAttested === false) {
    unset.adultAttestedAt = "";
    unset.aiConsentAt = "";
  }
  if (input.aiConsent === true) {
    const attested =
      input.adultAttested === true || (!!doc.adultAttestedAt && input.adultAttested !== false);
    if (!attested) {
      issues.push({
        path: "aiConsent",
        message: "Confirm that you are 18 or older to turn on AI features.",
      });
    } else {
      set.aiConsentAt = doc.aiConsentAt ?? at;
    }
  }
  if (input.aiConsent === false) unset.aiConsentAt = "";

  if (input.onboarded === true) set.onboardedAt = doc.onboardedAt ?? at;

  if (issues.length > 0) {
    throw new ApiError(400, "validation_failed", "Some fields are invalid.", issues);
  }
  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return toProfile(doc, at, names);
  }

  const updated = await User.findOneAndUpdate(
    { _id: doc._id },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
    { returnDocument: "after", runValidators: true },
  )
    .select(PROFILE_FIELDS)
    .lean();
  if (!updated) throw new ApiError(404, "not_found", "Account not found.");
  return toProfile(updated, at, names);
}

/** The dedicated consent endpoint: attestation + consent in one step. */
export function grantAiConsent(userId: string): Promise<ProfileView> {
  return updateProfile(userId, { adultAttested: true, aiConsent: true });
}

/** "Turn off AI features". */
export function revokeAiConsent(userId: string): Promise<ProfileView> {
  return updateProfile(userId, { aiConsent: false });
}
