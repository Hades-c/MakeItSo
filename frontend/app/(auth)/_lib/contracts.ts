import { z } from "zod";
import { EmailSchema, PasswordSchema } from "@/lib/api/account";
import { ProfileResponseSchema } from "@/lib/api/profile";
import { apiRoute } from "@/lib/api/spec";
import { IsoDateTimeSchema } from "@/lib/types/common";

/**
 * W3 route contracts that are not in lib/api yet (isomorphic: route handlers and client forms share them). Each is
 * filed as a contractRequest to move into lib/api/account.ts or lib/api/profile.ts; until the orchestrator does,
 * this file is their single source of truth. Same conventions as lib/api (strict bodies, `null` = 204).
 */

/** Page paths lib/routes.ts does not have yet (contractRequest: routes.forgotPassword()). */
export const FORGOT_PASSWORD_PATH = "/forgot-password";

/** What every enumeration-safe "we e-mailed you" endpoint answers (202). */
export const CheckInboxResponseSchema = z.object({
  status: z.literal("check-inbox"),
  message: z.string(),
});
export type CheckInboxResponse = z.infer<typeof CheckInboxResponseSchema>;

export const CodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

/** POST /api/auth/password-reset: always 202 (no account enumeration); 503 while no mail provider exists. */
export const PasswordResetRequestBodySchema = z.object({ email: EmailSchema }).strict();

/** POST /api/auth/password-reset/confirm: code from the e-mail + the new password → 204. */
export const PasswordResetConfirmBodySchema = z
  .object({ email: EmailSchema, code: CodeSchema, newPassword: PasswordSchema })
  .strict();

/**
 * PUT /api/profile/ai-consent: the dedicated consent endpoint (the AI consent notice's "Turn on AI features").
 * Consent needs the 18+ attestation (PLAN §1, until the owner decides on minors), so the body carries it.
 */
export const AiConsentBodySchema = z.object({ adultAttested: z.literal(true) }).strict();

/** GET /api/auth/test-mailbox?email=: the console mailer's outbox for one address (e2e only; 404 elsewhere). */
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

export const authExtraApi = {
  requestPasswordReset: apiRoute({
    method: "POST",
    path: "/api/auth/password-reset",
    auth: "public",
    body: PasswordResetRequestBodySchema,
    response: CheckInboxResponseSchema,
    status: 202,
  }),
  confirmPasswordReset: apiRoute({
    method: "POST",
    path: "/api/auth/password-reset/confirm",
    auth: "public",
    body: PasswordResetConfirmBodySchema,
    response: null,
  }),
  grantAiConsent: apiRoute({
    method: "PUT",
    path: "/api/profile/ai-consent",
    auth: "user",
    body: AiConsentBodySchema,
    response: ProfileResponseSchema,
  }),
  /** "Turn off AI features": clears aiConsentAt (the attestation stays). */
  revokeAiConsent: apiRoute({
    method: "DELETE",
    path: "/api/profile/ai-consent",
    auth: "user",
    response: ProfileResponseSchema,
  }),
  testMailbox: apiRoute({
    method: "GET",
    path: "/api/auth/test-mailbox",
    auth: "public",
    query: TestMailboxQuerySchema,
    response: TestMailboxResponseSchema,
  }),
} as const;
