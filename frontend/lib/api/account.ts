import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import { IsoDateTimeSchema, ObjectIdSchema } from "@/lib/types/common";

/**
 * Account and registration contracts (W3: app/api/{auth,account,me}/**; PLAN §1 "Sign-up", §6.1 W3). Every
 * endpoint that could reveal whether an address has an account answers the same 202 "check your inbox". The
 * profile lives in lib/api/profile.ts.
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

/**
 * The mailbox an address delivers to: Davidson mail (Microsoft 365) accepts plus-addressing, so "sam+1@davidson.edu"
 * reaches sam@davidson.edu. Per-student limits (AI quotas, distinct reporters) key on this, not on the account, and
 * new Davidson sign-ups may not use a +tag at all (DavidsonEmailSchema).
 */
export function canonicalMailbox(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0 || normalized.slice(at + 1) !== "davidson.edu") return normalized;
  return `${normalized.slice(0, at).split("+")[0]}@davidson.edu`;
}

export const PLUS_ADDRESS_MESSAGE = "Use your Davidson address without a +tag";

/**
 * What a signed-in account without a verified @davidson.edu mailbox is told (PLAN §1; owner to confirm, §8). Used by
 * defineRoute's "verified" 403 and by the AI routes' `unverified` result.
 */
export const UNVERIFIED_MESSAGE =
  "The alumni network and AI features are limited to verified @davidson.edu accounts.";

export const DavidsonEmailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .regex(DAVIDSON_EMAIL_PATTERN, "Use your @davidson.edu email address")
      // One mailbox, one account: a +tag alias would get its own AI quota and count as another reporter.
      .refine((email) => !email.split("@")[0]!.includes("+"), PLUS_ADDRESS_MESSAGE),
  );

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
 * What every enumeration-safe "we e-mailed you" endpoint answers (202): registration and "Forgot password". The
 * answer is the same whether or not the address has an account; `message` says what to do next (it differs only
 * by whether mail can be sent at all).
 */
export const CheckInboxResponseSchema = z.object({
  status: z.literal("check-inbox"),
  message: z.string(),
});
export type CheckInboxResponse = z.infer<typeof CheckInboxResponseSchema>;

/** A 6-digit one-time code (mailbox verification, password reset). */
export const VerificationCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

/**
 * POST /api/auth/register: new accounts are @davidson.edu only (PLAN §1). Always answers 202
 * `{ status: "check-inbox", message }` (no account enumeration).
 */
export const RegisterBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: DavidsonEmailSchema,
    password: PasswordSchema,
    graduationYear: z.number().int().min(2000).max(2100).optional(),
  })
  .strict();
export const RegisterResponseSchema = CheckInboxResponseSchema;

/** 6-digit mailbox verification code (15 min TTL, 5 attempts, 3 resends per hour). */
export const VerifyBodySchema = z.object({ code: VerificationCodeSchema }).strict();
export const VerifyResponseSchema = z.object({
  verified: z.literal(true),
  emailVerifiedAt: IsoDateTimeSchema,
});

export const ChangePasswordBodySchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: PasswordSchema })
  .strict();

export const DeleteAccountBodySchema = z.object({ password: z.string().min(1).max(200) }).strict();

/** POST /api/auth/password-reset: always 202 (no account enumeration); 503 while no mail provider exists. */
export const PasswordResetRequestBodySchema = z.object({ email: EmailSchema }).strict();

/** POST /api/auth/password-reset/confirm: the code from the e-mail + the new password → 204. */
export const PasswordResetConfirmBodySchema = z
  .object({ email: EmailSchema, code: VerificationCodeSchema, newPassword: PasswordSchema })
  .strict();

/**
 * GET /api/auth/test-mailbox?email= (FIXTURES ONLY: EXTERNAL_MODE=fixtures + MAIL_PROVIDER=console, never on
 * Vercel; 404 everywhere else): the console mailer's recent messages to one address, so e2e can read codes.
 */
export const TestMailboxQuerySchema = z.object({ email: EmailSchema });
export const TestMailboxResponseSchema = z.object({
  messages: z.array(
    z.object({
      kind: z.string(),
      to: z.string(),
      subject: z.string(),
      text: z.string(),
      code: z.string().nullable(),
      sentAt: IsoDateTimeSchema,
    }),
  ),
});

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
  /** POST /api/auth/password-reset: e-mail a reset code if an account uses the address; always 202. */
  requestPasswordReset: apiRoute({
    method: "POST",
    path: "/api/auth/password-reset",
    auth: "public",
    body: PasswordResetRequestBodySchema,
    response: CheckInboxResponseSchema,
    status: 202,
  }),
  /** POST /api/auth/password-reset/confirm: address + code + new password → 204 (signs out other sessions). */
  confirmPasswordReset: apiRoute({
    method: "POST",
    path: "/api/auth/password-reset/confirm",
    auth: "public",
    body: PasswordResetConfirmBodySchema,
    response: null,
  }),
  /** GET /api/auth/test-mailbox?email= — fixtures-only e2e hook (see TestMailboxQuerySchema); 404 elsewhere. */
  testMailbox: apiRoute({
    method: "GET",
    path: "/api/auth/test-mailbox",
    auth: "public",
    query: TestMailboxQuerySchema,
    response: TestMailboxResponseSchema,
  }),
} as const;
