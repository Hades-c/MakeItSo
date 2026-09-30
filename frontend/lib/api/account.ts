import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import { IsoDateTimeSchema, ObjectIdSchema } from "@/lib/types/common";

/**
 * Account and registration contracts (W3: app/api/{auth,account,me}/**; PLAN §1 "Sign-up", §6.1 W3). The route
 * that exists today (POST /api/auth/register) keeps its wave-0 behaviour until W3 moves it to these schemas; the
 * notes below say what changes. The profile lives in lib/api/profile.ts.
 */

// ---- E-mail and passwords ----------------------------------------------------------------------------------------

/** NFKC → trim → lower case (PLAN §1). */
export function normalizeEmail(input: string): string {
  return input.normalize("NFKC").trim().toLowerCase();
}

/** New sign-ups: only @davidson.edu (checked after normalizeEmail). Existing accounts are never re-checked. */
export const DAVIDSON_EMAIL_PATTERN = /^[a-z0-9._%+-]+@davidson\.edu$/;

export function isDavidsonEmail(email: string): boolean {
  return DAVIDSON_EMAIL_PATTERN.test(normalizeEmail(email));
}

export const DavidsonEmailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .pipe(z.string().regex(DAVIDSON_EMAIL_PATTERN, "Use your @davidson.edu email address"));

/** Any e-mail (sign-in: legacy non-Davidson accounts keep working). */
export const EmailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .pipe(z.email("Enter a valid email address"));

export const PASSWORD_MIN_BYTES = 10;
/** bcrypt ignores bytes after 72. */
export const PASSWORD_MAX_BYTES = 72;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * 10–72 UTF-8 bytes, not all whitespace (PLAN §6.1 W3). The server additionally rejects passwords in its bundled
 * top-10k list (not shipped to the client).
 */
export const PasswordSchema = z
  .string()
  .refine((p) => utf8ByteLength(p) >= PASSWORD_MIN_BYTES, "Use at least 10 characters")
  .refine((p) => utf8ByteLength(p) <= PASSWORD_MAX_BYTES, "Use at most 72 bytes")
  .refine((p) => p.trim().length > 0, "The password cannot be only spaces");

// ---- Registration and verification -------------------------------------------------------------------------------

/**
 * POST /api/auth/register (W3 target). Always answers 202 "Check your Davidson inbox" (no account enumeration).
 * Wave-0 behaviour until W3: any e-mail, password ≥ 8, 201 `{ message, userId }`.
 */
export const RegisterBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: DavidsonEmailSchema,
    password: PasswordSchema,
    graduationYear: z.number().int().min(2000).max(2100).optional(),
  })
  .strict();
export const RegisterResponseSchema = z.object({ message: z.string() });

/** 6-digit mailbox verification code (15 min TTL, 5 attempts, 3 resends per hour). */
export const VerifyBodySchema = z
  .object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") })
  .strict();
export const VerifyResponseSchema = z.object({
  verified: z.literal(true),
  emailVerifiedAt: IsoDateTimeSchema,
});

export const ChangePasswordBodySchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: PasswordSchema })
  .strict();

export const DeleteAccountBodySchema = z.object({ password: z.string().min(1).max(200) }).strict();

/** GET /api/me: who is signed in and what they may use. */
export const MeResponseSchema = z.object({
  me: z.object({
    id: ObjectIdSchema,
    name: z.string(),
    email: z.string(),
    verifiedDavidson: z.boolean(),
    onboarded: z.boolean(),
  }),
});

/** GET /api/me/export (5/day): every collection registered in server/account/erasers.ts, keyed by name. */
export const AccountExportSchema = z.object({
  exportedAt: IsoDateTimeSchema,
  profile: z.record(z.string(), z.unknown()),
  data: z.record(z.string(), z.unknown()),
});

export const accountApi = {
  register: apiRoute({
    method: "POST",
    path: "/api/auth/register",
    auth: "public",
    body: RegisterBodySchema,
    response: RegisterResponseSchema,
    status: 202,
  }),
  me: apiRoute({ method: "GET", path: "/api/me", auth: "user", response: MeResponseSchema }),
  export: apiRoute({
    method: "GET",
    path: "/api/me/export",
    auth: "user",
    response: AccountExportSchema,
  }),
  /** DELETE /api/me: password re-entry; runs every eraser; 204 and clears the session cookies. */
  delete: apiRoute({
    method: "DELETE",
    path: "/api/me",
    auth: "user",
    body: DeleteAccountBodySchema,
    response: null,
  }),
  verify: apiRoute({
    method: "POST",
    path: "/api/account/verify",
    auth: "user",
    body: VerifyBodySchema,
    response: VerifyResponseSchema,
  }),
  resendVerification: apiRoute({
    method: "POST",
    path: "/api/account/verify/resend",
    auth: "user",
    response: z.object({ sent: z.boolean() }),
    status: 202,
  }),
  changePassword: apiRoute({
    method: "POST",
    path: "/api/account/password",
    auth: "user",
    body: ChangePasswordBodySchema,
    response: null,
  }),
  /** DELETE /api/account/sessions: sign out everywhere (bumps sessionVersion). */
  signOutEverywhere: apiRoute({
    method: "DELETE",
    path: "/api/account/sessions",
    auth: "user",
    response: null,
  }),
} as const;
