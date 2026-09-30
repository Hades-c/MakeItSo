import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import { CLASS_STANDINGS } from "@/lib/term";
import { IsoDateTimeSchema, ObjectIdSchema, SlugSchema, TermCodeSchema } from "@/lib/types/common";

/**
 * Profile contracts (W3: app/api/profile/**). GET/PATCH /api/profile keep their wave-0 behaviour (`{ user }` and
 * the legacy field whitelist) until W3 moves them to these schemas.
 */

export const ClassStandingSchema = z.enum(CLASS_STANDINGS);

/**
 * The profile as the app reads it (W3). `majors`/`minors` are official Acalog offering names (legacy `major`
 * strings are mapped on read). `interests` are career-path slugs (one taxonomy). No grades, no bio in AI payloads.
 */
export const ProfileSchema = z.object({
  id: ObjectIdSchema,
  name: z.string(),
  email: z.string(),
  /** When the mailbox was verified; null for unverified (and legacy) accounts. */
  emailVerifiedAt: IsoDateTimeSchema.nullable(),
  /** email is @davidson.edu. Alumni, cold email and AI need davidson && emailVerifiedAt. */
  davidson: z.boolean(),
  majors: z.array(z.string()).max(3),
  minors: z.array(z.string()).max(3),
  graduationYear: z.number().int(),
  /** First term at Davidson (default: Fall of graduationYear − 4). */
  firstTerm: TermCodeSchema.nullable(),
  standingOverride: ClassStandingSchema.nullable(),
  interests: z.array(SlugSchema).max(24),
  aiConsentAt: IsoDateTimeSchema.nullable(),
  adultAttestedAt: IsoDateTimeSchema.nullable(),
  onboardedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * PATCH /api/profile (W3 target): strict whitelist; `null` → `$unset` for clearable fields. The booleans set or
 * clear the matching timestamps (aiConsent → aiConsentAt, adultAttested → adultAttestedAt, onboarded →
 * onboardedAt). Wave-0 behaviour until W3: {name, major, minor, graduationYear, currentYear, bio, careerInterests}.
 */
export const ProfilePatchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    majors: z.array(z.string().trim().min(1).max(120)).max(3),
    minors: z.array(z.string().trim().min(1).max(120)).max(3),
    graduationYear: z.number().int().min(2000).max(2100),
    firstTerm: TermCodeSchema.nullable(),
    standingOverride: ClassStandingSchema.nullable(),
    interests: z.array(SlugSchema).max(24),
    aiConsent: z.boolean(),
    adultAttested: z.boolean(),
    onboarded: z.literal(true),
  })
  .partial()
  .strict();
export type ProfilePatchBody = z.input<typeof ProfilePatchBodySchema>;

export const ProfileResponseSchema = z.object({ profile: ProfileSchema });

export const profileApi = {
  get: apiRoute({
    method: "GET",
    path: "/api/profile",
    auth: "user",
    response: ProfileResponseSchema,
  }),
  update: apiRoute({
    method: "PATCH",
    path: "/api/profile",
    auth: "user",
    body: ProfilePatchBodySchema,
    response: ProfileResponseSchema,
  }),
} as const;
